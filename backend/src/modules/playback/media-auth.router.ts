import type { Request, Response } from 'express';
import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { signMediaPath, verifyMediaToken } from '../../lib/mediaToken.js';

// ─────────────────────────────────────────────────────────────────────────────
// Media authorization for the reverse proxy (nginx auth_request / MediaMTX
// authHTTPAddress). MediaMTX is NEVER exposed to the browser directly; before any
// HLS/WebRTC byte is served, the proxy calls GET /api/media/authorize, which
// validates a short-lived, session-bound signed token. RBAC + camera-scope were
// already enforced when the session was created (playback.service.startSession),
// so this endpoint is intentionally NOT behind requireAuth — the signed token IS
// the credential. Returns 204 (allow) or 403 (deny). Never logs the token.
//
// TRANSPORT — a path-scoped cookie, not a query token:
//   HLS is a *multi-file* protocol: the player fetches a master playlist, then a
//   media playlist, an init segment, and a long run of media segments — each a
//   SEPARATE same-origin request whose URL MediaMTX emits as a bare relative name
//   carrying no token. A token pinned to the index.m3u8 URL never reaches those
//   child requests, so they would 403 and playback would stall after the first
//   request. WebRTC/WHEP is likewise multi-request (OPTIONS/POST, then PATCH/
//   DELETE on a sub-resource). We therefore mint an HttpOnly, Secure,
//   SameSite=Strict cookie scoped to the session's canonical media prefix
//   (/media/{hls,webrtc}/<env>/<kind>/<cameraCode>/<sessionId>/). The browser
//   attaches it automatically to EVERY child request under that prefix — and to
//   no other camera/session, since the prefix carries a unique sessionId so the
//   scoped cookie paths never overlap. HttpOnly keeps it out of JS/console and no
//   token is ever placed in a URL, so nginx/proxy access logs never capture it.
//
// AUTHORIZATION — session-prefix binding (not exact leaf):
//   The signed token binds the 4-segment session prefix. We recompute that prefix
//   from the requested path (first four segments), reject path traversal / encoded
//   slashes / malformed shapes, verify the HMAC over the prefix, and confirm the
//   prefix maps to a LIVE (endedAt: null) streamSession. This authorizes exactly
//   that session's playlist/segment/whep paths and rejects another camera,
//   another session, a modified path, or arbitrary /media/* access.
// ─────────────────────────────────────────────────────────────────────────────

export const mediaAuthRouter = Router();

/** Cookie name for the browser-facing media-auth token. */
export const MEDIA_AUTH_COOKIE = 'media_auth';

// buildMediamtxPath() → `<env>/<kind>/<cameraCode>/<sessionId>` — exactly 4 segs.
const PREFIX_SEGMENTS = 4;
const ENV_SEG_RE = /^(?:live|sim)$/;
const KIND_SEG_RE = /^(?:live-main|live-sub|playback)$/;
const MEDIA_PREFIX_RE = /^\/media\/(?:hls|webrtc)\//;

/**
 * Set the media-auth cookie on both transport prefixes (hls + webrtc) for a live
 * session. Called on session start and refreshed on heartbeat / getSession so a
 * long-running view never expires mid-playback. HttpOnly (invisible to JS/console),
 * Secure in production, SameSite=Strict, and Max-Age == token TTL.
 */
export function setMediaAuthCookies(
  res: Response,
  mediamtxPath: string,
  ttlSeconds: number = env.PLAYBACK_URL_TTL_SECONDS
): void {
  const { exp, sig } = signMediaPath(mediamtxPath, ttlSeconds);
  const value = `${exp}.${sig}`;
  const base = {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: ttlSeconds * 1000,
  };
  res.cookie(MEDIA_AUTH_COOKIE, value, { ...base, path: `/media/hls/${mediamtxPath}/` });
  res.cookie(MEDIA_AUTH_COOKIE, value, { ...base, path: `/media/webrtc/${mediamtxPath}/` });
}

/** Clear the media-auth cookie for a session (best-effort; DB endedAt is the gate). */
export function clearMediaAuthCookies(res: Response, mediamtxPath: string): void {
  const base = {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
  };
  res.clearCookie(MEDIA_AUTH_COOKIE, { ...base, path: `/media/hls/${mediamtxPath}/` });
  res.clearCookie(MEDIA_AUTH_COOKIE, { ...base, path: `/media/webrtc/${mediamtxPath}/` });
}

function decodeSeg(seg: string): string | null {
  try {
    return decodeURIComponent(seg);
  } catch {
    return null;
  }
}

/** A segment is safe iff it is non-empty and not a traversal / slash-smuggle. */
function isUnsafeSeg(seg: string): boolean {
  return seg.length === 0 || seg === '.' || seg === '..' || seg.includes('/') || seg.includes('\\');
}

/** Validate the 4 prefix segments (shape + no traversal); return prefix or null. */
function validatePrefix(segs: string[]): string | null {
  if (segs.length < PREFIX_SEGMENTS) return null;
  const prefixSegs = segs.slice(0, PREFIX_SEGMENTS);
  if (prefixSegs.some(isUnsafeSeg)) return null;
  if (!ENV_SEG_RE.test(prefixSegs[0]) || !KIND_SEG_RE.test(prefixSegs[1])) return null;
  return prefixSegs.join('/');
}

/** Derive the session prefix from a proxied `/media/{hls,webrtc}/…` request path. */
function prefixFromMediaPath(rawPath: string): string | null {
  if (!MEDIA_PREFIX_RE.test(rawPath)) return null;
  const sub = rawPath.replace(MEDIA_PREFIX_RE, '');
  const rawSegs = sub.split('/');
  // Need the 4 prefix segments + at least one leaf (index.m3u8 / whep / segment).
  if (rawSegs.length <= PREFIX_SEGMENTS) return null;
  const decoded: string[] = [];
  for (const seg of rawSegs) {
    const d = seg.length === 0 ? '' : decodeSeg(seg);
    if (d === null || isUnsafeSeg(d)) return null;
    decoded.push(d);
  }
  return validatePrefix(decoded);
}

interface MediaTokenParts {
  exp: number;
  sig: string;
}

function splitCookieToken(raw: string): MediaTokenParts | null {
  const dot = raw.indexOf('.');
  if (dot <= 0 || dot === raw.length - 1) return null;
  const exp = Number(raw.slice(0, dot));
  const sig = raw.slice(dot + 1);
  if (!Number.isInteger(exp) || sig.length === 0) return null;
  return { exp, sig };
}

function fromPair(exp: string | null | undefined, sig: string | null | undefined): MediaTokenParts | null {
  if (typeof exp !== 'string' || typeof sig !== 'string' || sig.length === 0) return null;
  const n = Number(exp);
  return Number.isInteger(n) ? { exp: n, sig } : null;
}

/** Token from cookie (primary — rides every child request), then query fallbacks. */
function readToken(req: Request, uriQuery: URLSearchParams): MediaTokenParts | null {
  const cookie = (req.cookies as Record<string, string> | undefined)?.[MEDIA_AUTH_COOKIE];
  if (typeof cookie === 'string') {
    const fromCookie = splitCookieToken(cookie);
    if (fromCookie) return fromCookie;
  }
  // Fallbacks for direct/test callers: exp/sig in the proxied URI query, then in
  // this request's own query string.
  return (
    fromPair(uriQuery.get('exp'), uriQuery.get('sig')) ??
    fromPair(
      typeof req.query.exp === 'string' ? req.query.exp : null,
      typeof req.query.sig === 'string' ? req.query.sig : null
    )
  );
}

mediaAuthRouter.get(
  '/media/authorize',
  asyncHandler(async (req, res) => {
    const deny = (): void => {
      res.status(403).json({ success: false });
    };

    const originalUri = req.get('x-original-uri') ?? '';
    const qIdx = originalUri.indexOf('?');
    const rawPath = qIdx >= 0 ? originalUri.slice(0, qIdx) : originalUri;
    const uriQuery = new URLSearchParams(qIdx >= 0 ? originalUri.slice(qIdx + 1) : '');

    let prefix = rawPath ? prefixFromMediaPath(rawPath) : null;
    // Direct/test callers may pass ?path=<mediamtxPath> instead of X-Original-URI.
    if (!prefix && typeof req.query.path === 'string') {
      prefix = validatePrefix(req.query.path.split('/'));
    }
    if (!prefix) {
      deny();
      return;
    }

    const token = readToken(req, uriQuery);
    if (!token || !verifyMediaToken(prefix, token.exp, token.sig)) {
      deny();
      return;
    }

    // Defense in depth: the token must map to a live (non-ended) session.
    const session = await prisma.streamSession.findFirst({
      where: { mediamtxPath: prefix, endedAt: null },
      select: { id: true },
    });
    if (!session) {
      deny();
      return;
    }

    res.status(204).end();
  })
);
