// ─────────────────────────────────────────────────────────────────────────────
// Shared RTSP URL handling — the ONE canonical normalizer + credential injector
// + redactor used by every RTSP code path (camera create/update validation,
// Test Connection, scheduled health diagnostics, FFprobe/FFmpeg capture,
// snapshot capture, and the MediaMTX / Live Wall adapter).
//
// Why this exists: vendor/ONVIF/Hikvision/Dahua config pages hand out URLs that
// are copied verbatim into the camera form, e.g.
//
//   rtsp://<host>:<port>/user=<u>_password=<p>_channel=<c>_stream=<s>&amp;onvif=0.sdp?<suffix>
//
// Those legacy URLs carry credentials in the *path* (not userinfo), preserve a
// vendor-specific token order, and are frequently pasted with an HTML-encoded
// ampersand (`&amp;`) that is never valid on the wire. ffmpeg/MediaMTX must
// receive the exact vendor path with a literal `&`, and we must NEVER rebuild
// that path (URLSearchParams/URL.toString reorders + percent-re-encodes it,
// silently turning one camera's stream into a different — or broken — one).
//
// SECURITY: nothing here logs or returns a credential. `normalizeRtspUrl` throws
// `InvalidRtspUrlError`, whose message is a fixed reason string and never
// contains the offending URL. Use `redactRtsp()` before putting any RTSP-derived
// text into a log, error detail, API response, audit record or test assertion.
// ─────────────────────────────────────────────────────────────────────────────

/** Thrown for any URL that must be rejected. The message is a fixed reason and
 *  NEVER contains the URL or its credentials — safe to surface to callers/logs. */
export class InvalidRtspUrlError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`Invalid RTSP URL (${reason})`);
    this.name = 'InvalidRtspUrlError';
    this.reason = reason;
  }
}

const RTSP_SCHEME_RE = /^rtsps?:\/\//i;
// rtsp://user:pass@host — credentials already in the URL userinfo.
const HAS_USERINFO_RE = /^rtsps?:\/\/[^/@]+@/i;

// Any C0 control char (incl. CR/LF/TAB), a raw space, or DEL. A well-formed RTSP
// URL has none of these after trimming; a raw CR/LF is an injection attempt.
// Checked BEFORE `new URL()`, which would otherwise silently STRIP tabs/newlines
// and mask the injection. The control chars in this class are intentional — this
// regex exists specifically to detect them — so no-control-regex is disabled here.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS_RE = /[\u0000-\u0020\u007f]/;

// HTML ampersand entities: named (&amp;), decimal (&#38;), hex (&#x26;), with
// optional leading zeros. Applied iteratively so accidentally double-encoded
// forms (&amp;amp;, &amp;#38;, …) collapse to a single literal `&`.
const AMP_ENTITY_RE = /&(?:amp;|#0*38;|#x0*26;)/gi;

/** One straight or smart quote character. */
const QUOTE_CHARS = new Set(['"', "'", '‘', '’', '“', '”', '`']);

function stripWrappingQuotes(s: string): string {
  // Peel matched surrounding quotes (handles `"…"`, `'…'`, and smart quotes),
  // re-trimming between layers, until neither end is a wrapping quote.
  let prev: string;
  do {
    prev = s;
    if (
      s.length >= 2 &&
      QUOTE_CHARS.has(s[0]!) &&
      (s[s.length - 1] === s[0] ||
        (s[0] === '‘' && s[s.length - 1] === '’') ||
        (s[0] === '“' && s[s.length - 1] === '”'))
    ) {
      s = s.slice(1, -1).trim();
    }
  } while (s !== prev);
  return s;
}

/** Collapse HTML ampersand entities (incl. double-encoded) to a literal `&`. */
function decodeAmpEntities(s: string): string {
  let prev: string;
  do {
    prev = s;
    s = s.replace(AMP_ENTITY_RE, '&');
  } while (s !== prev);
  return s;
}

/**
 * Canonicalize an RTSP URL for the wire. Idempotent. On success returns a string
 * that ffmpeg/MediaMTX can open directly; on any invalid input throws
 * `InvalidRtspUrlError` (message never contains the URL).
 *
 * Guarantees:
 *  - trims surrounding whitespace and accidental wrapping quotes;
 *  - accepts ONLY rtsp:// and rtsps:// (case-insensitive scheme, lowercased);
 *  - converts &amp; / &#38; / &#x26; (and double-encodings) to a literal `&`;
 *  - preserves the vendor path, underscores, parameter order, query suffix and
 *    case EXACTLY (returns the original bytes — never rebuilt via URL/URLSearchParams);
 *  - never touches percent-encoding;
 *  - rejects control chars, CRLF injection, missing host, invalid port, malformed URLs;
 *  - supports IPv4, DNS names, IPv6 ([::1]), userinfo creds AND legacy path creds.
 */
export function normalizeRtspUrl(raw: unknown): string {
  if (typeof raw !== 'string') throw new InvalidRtspUrlError('not-a-string');

  let s = stripWrappingQuotes(raw.trim());
  s = decodeAmpEntities(s);

  // Reject control chars / CRLF / raw spaces before parsing (see FORBIDDEN_CHARS_RE).
  if (FORBIDDEN_CHARS_RE.test(s)) throw new InvalidRtspUrlError('control-char');
  if (!RTSP_SCHEME_RE.test(s)) throw new InvalidRtspUrlError('unsupported-scheme');

  let u: URL;
  try {
    // Parse for VALIDATION ONLY — we never read pathname/search back out, so the
    // vendor path is preserved byte-for-byte in the returned `s`.
    u = new URL(s);
  } catch {
    throw new InvalidRtspUrlError('malformed');
  }
  // Non-special schemes (rtsp) permit an empty host — reject it explicitly.
  if (!u.hostname) throw new InvalidRtspUrlError('missing-host');
  if (u.port !== '') {
    const p = Number(u.port);
    if (!Number.isInteger(p) || p < 1 || p > 65535) throw new InvalidRtspUrlError('invalid-port');
  }

  // Lowercase ONLY the scheme; everything after `://` is returned untouched.
  return s.replace(RTSP_SCHEME_RE, (m) => m.toLowerCase());
}

/** True if `raw` normalizes cleanly. Never throws. */
export function isValidRtspUrl(raw: unknown): boolean {
  try {
    normalizeRtspUrl(raw);
    return true;
  } catch {
    return false;
  }
}

/**
 * Inject stored username/password into an `rtsp://host/…` URL as userinfo.
 * Left UNTOUCHED only when the URL ALREADY has real userinfo (`user:pass@`) or
 * no username is stored — a fully-pasted credentialed URL keeps working verbatim.
 *
 * Legacy vendor path tokens (`…/user=x_password=y`) are NOT treated as valid
 * credentials: libavformat (ffmpeg/ffprobe) and MediaMTX never use path tokens
 * for RTSP auth, so a Digest-challenging camera 401s unless the creds are in the
 * userinfo too. We therefore still inject; the path tokens stay intact (they're
 * part of the request-URI) and the injection is additive. This is what makes
 * Test Connection, live-wall snapshots, and MediaMTX streaming authenticate
 * against real Hikvision/Dahua cameras that store creds in separate fields.
 *
 * Assumes `rawUrl` is already normalized. Credentials are percent-encoded so
 * `@`/`:`/`/` in a password can't break the authority.
 */
export function injectRtspCredentials(rawUrl: string, username: string, password: string): string {
  if (!username || HAS_USERINFO_RE.test(rawUrl)) return rawUrl;
  return rawUrl.replace(
    RTSP_SCHEME_RE,
    (m) => `${m}${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
  );
}

// ─── Redaction ───────────────────────────────────────────────────────────────
// `redactRtsp` scrubs every credential representation from any text before it
// reaches a log, error detail, API response, audit record or test assertion.
// ffmpeg/RTSP diagnostics echo the source URL verbatim in both shapes:
//   1. userinfo:      rtsp://user:pass@host/path
//   2. Dahua/Hik path/query params, `_`- or `&`-separated, often BEFORE any `@`.
// Non-secret fields (method names, status codes, channel=, resolution=) survive.

const SECRET_PARAM_KEYS =
  'user(?:name)?|pass(?:word|wd)?|pwd|passwd|auth(?:orization)?|access[_-]?token|api[_-]?key|token|secret|credentials?|sig(?:nature)?|psk|key';

// A secret key=value pair. The value ends at a standard URL delimiter OR at the
// start of the next `_key=` token (the underscore-separated Dahua convention),
// so adjacent non-secret fields are preserved rather than swallowed.
const SECRET_PARAM_RE = new RegExp(
  `(?<![A-Za-z0-9])(${SECRET_PARAM_KEYS})=(?:(?!_[A-Za-z][\\w-]*=)[^\\s&?#/;'"<>\\\\])*`,
  'gi'
);

export function redactRtsp(text: string): string {
  if (!text) return text;
  return (
    text
      // 1. scheme://user:pass@host  ->  scheme://***@host  (any URL scheme)
      .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/gi, '$1***@')
      // 2. sensitive key=value pairs embedded in the path/query
      .replace(SECRET_PARAM_RE, (_m, key: string) => `${key}=***`)
      // 3. Authorization header values, and standalone bearer/basic tokens
      .replace(/\b((?:proxy-)?authorization)\s*:\s*[^\r\n]+/gi, '$1: ***')
      .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi, 'Bearer ***')
      .replace(/\bBasic\s+[A-Za-z0-9+/]{8,}={0,2}/gi, 'Basic ***')
  );
}

/** Broader alias — identical scrubbing, clearer name for non-RTSP callers. */
export const redactSecrets = redactRtsp;
