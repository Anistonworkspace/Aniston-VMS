import { describe, it, expect } from 'vitest';
import {
  normalizeRtspUrl,
  isValidRtspUrl,
  injectRtspCredentials,
  redactRtsp,
  redactSecrets,
  InvalidRtspUrlError,
} from './rtsp-url.js';

// ─────────────────────────────────────────────────────────────────────────────
// NOTE: every credential in this file is FABRICATED. No real camera password or
// customer IP appears here. `redactRtsp` is the guard that keeps real secrets out
// of logs/errors/tests; these cases prove the guard, not any live credential.
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeRtspUrl — valid inputs are preserved byte-for-byte (except scheme case)', () => {
  const passthrough: Array<[string, string]> = [
    // [input, expected]
    ['rtsp://cam.example/stream1', 'rtsp://cam.example/stream1'],
    ['rtsp://cam.example:554/h264Preview_01_main', 'rtsp://cam.example:554/h264Preview_01_main'],
    // userinfo credentials preserved verbatim
    ['rtsp://operator:Pa55@cam.example:554/live', 'rtsp://operator:Pa55@cam.example:554/live'],
    // legacy vendor path creds: order/underscores/query/case preserved EXACTLY
    [
      'rtsp://10.20.40.11:554/user=admin_password=FAKEpw9_channel=1_stream=0&onvif=0.sdp?real_stream',
      'rtsp://10.20.40.11:554/user=admin_password=FAKEpw9_channel=1_stream=0&onvif=0.sdp?real_stream',
    ],
    // IPv6 literal host
    ['rtsp://[2001:db8::1]:8554/live/sub', 'rtsp://[2001:db8::1]:8554/live/sub'],
    // rtsps
    ['rtsps://secure.example:322/media', 'rtsps://secure.example:322/media'],
    // scheme case is normalized; everything after :// is untouched (host case kept)
    ['RTSP://Cam.Example:554/Stream1', 'rtsp://Cam.Example:554/Stream1'],
    ['Rtsp://Cam.Example/Path', 'rtsp://Cam.Example/Path'],
  ];

  it.each(passthrough)('normalizes %j -> %j', (input, expected) => {
    expect(normalizeRtspUrl(input)).toBe(expected);
  });

  it.each(passthrough)('is idempotent for %j', (input) => {
    const once = normalizeRtspUrl(input);
    expect(normalizeRtspUrl(once)).toBe(once);
  });
});

describe('normalizeRtspUrl — sanitizing transforms', () => {
  const cases: Array<[string, string, string]> = [
    // [label, input, expected]
    ['trims surrounding whitespace', '   rtsp://cam.example/s   ', 'rtsp://cam.example/s'],
    ['strips wrapping double quotes', '"rtsp://cam.example/s"', 'rtsp://cam.example/s'],
    ['strips wrapping single quotes', "'rtsp://cam.example/s'", 'rtsp://cam.example/s'],
    ['strips wrapping smart quotes', '“rtsp://cam.example/s”', 'rtsp://cam.example/s'],
    [
      'strips nested/mismatched wrapping quotes with inner spaces',
      '  "  rtsp://cam.example/s  "  ',
      'rtsp://cam.example/s',
    ],
    [
      'decodes named &amp; entity',
      'rtsp://h:554/a&amp;onvif=0.sdp?x',
      'rtsp://h:554/a&onvif=0.sdp?x',
    ],
    ['decodes decimal &#38; entity', 'rtsp://h/a&#38;b', 'rtsp://h/a&b'],
    ['decodes hex &#x26; entity', 'rtsp://h/a&#x26;b', 'rtsp://h/a&b'],
    ['collapses double-encoded &amp;amp;', 'rtsp://h/a&amp;amp;b', 'rtsp://h/a&b'],
    ['does NOT touch percent-encoding', 'rtsp://h/a%20b%2Fc', 'rtsp://h/a%20b%2Fc'],
  ];

  it.each(cases)('%s', (_label, input, expected) => {
    expect(normalizeRtspUrl(input)).toBe(expected);
  });
});

describe('normalizeRtspUrl — rejects invalid input with a specific reason', () => {
  const invalid: Array<[unknown, string]> = [
    // [input, expected reason]
    [123, 'not-a-string'],
    [null, 'not-a-string'],
    [undefined, 'not-a-string'],
    [{}, 'not-a-string'],
    [['rtsp://h/s'], 'not-a-string'],
    [true, 'not-a-string'],
    // control chars / CRLF injection / raw space — all caught before URL parse.
    // (Trailing whitespace is TRIMMED and thus valid, so every control char here
    //  is placed MID-string; NUL/DEL use explicit escapes, never raw bytes.)
    ['rtsp://cam.example/a b', 'control-char'],
    ['rtsp://cam.example/st\r\nream', 'control-char'],
    ['rtsp://cam.example/s\r\nDESCRIBE evil', 'control-char'],
    ['rtsp://cam.example/\tstream', 'control-char'],
    ['rtsp://cam.example/a\u0000b', 'control-char'],
    ['rtsp://cam.example/a\u007fb', 'control-char'],
    // unsupported scheme
    ['http://cam.example/s', 'unsupported-scheme'],
    ['https://cam.example/s', 'unsupported-scheme'],
    ['file:///etc/passwd', 'unsupported-scheme'],
    ['ftp://cam.example/s', 'unsupported-scheme'],
    ['rtmp://cam.example/s', 'unsupported-scheme'],
    ['//cam.example/s', 'unsupported-scheme'],
    ['justsometext', 'unsupported-scheme'],
    ['', 'unsupported-scheme'],
    // malformed (WHATWG URL parser rejects outright)
    ['rtsp://cam.example:99999/s', 'malformed'],
    ['rtsp://:554/s', 'malformed'],
    // missing host
    ['rtsp://', 'missing-host'],
    // out-of-range port that URL accepts (port 0) — caught by our own check
    ['rtsp://cam.example:0/s', 'invalid-port'],
  ];

  it.each(invalid)('rejects %j as %s', (input, reason) => {
    try {
      normalizeRtspUrl(input);
      throw new Error('expected normalizeRtspUrl to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidRtspUrlError);
      expect((err as InvalidRtspUrlError).reason).toBe(reason);
    }
  });

  it('error message NEVER contains the offending URL or its credentials', () => {
    const secret = 'S3cretPw_leak_marker';
    try {
      // invalid because of the raw newline, but carries a credential in the path
      normalizeRtspUrl(`rtsp://admin:${secret}@10.9.9.9/ev\r\nil`);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidRtspUrlError);
      const msg = (err as Error).message;
      expect(msg).not.toContain(secret);
      expect(msg).not.toContain('10.9.9.9');
      expect(msg).toBe('Invalid RTSP URL (control-char)');
    }
  });
});

describe('isValidRtspUrl', () => {
  it('returns true for a normalizable URL', () => {
    expect(isValidRtspUrl('rtsp://cam.example/s')).toBe(true);
  });
  it('returns false for junk and never throws', () => {
    expect(isValidRtspUrl('http://x')).toBe(false);
    expect(isValidRtspUrl(42)).toBe(false);
    expect(isValidRtspUrl(undefined)).toBe(false);
  });
});

describe('injectRtspCredentials', () => {
  it('injects and percent-encodes creds into a bare URL', () => {
    // password contains @ : / which must be encoded so the authority stays intact
    expect(injectRtspCredentials('rtsp://cam.example:554/s', 'admin', 'p@ss:w/rd')).toBe(
      'rtsp://admin:p%40ss%3Aw%2Frd@cam.example:554/s'
    );
  });

  it('leaves a URL that already has userinfo untouched', () => {
    expect(injectRtspCredentials('rtsp://u:p@cam.example/s', 'admin', 'x')).toBe(
      'rtsp://u:p@cam.example/s'
    );
  });

  it('injects userinfo even when legacy path-cred tokens are present (path creds do NOT authenticate a digest-required camera)', () => {
    // The `…/user=x_password=y` tokens live in the request-URI path; libavformat
    // (ffmpeg/ffprobe) never uses them for RTSP auth, so a camera that challenges
    // for Digest 401s unless the creds are also in the userinfo. Injecting is
    // additive and safe — the path tokens stay intact for cameras that read them.
    const legacy = 'rtsp://10.20.40.11:554/user=admin_password=FAKEpw9_channel=1_stream=0';
    expect(injectRtspCredentials(legacy, 'admin', 'x')).toBe(
      'rtsp://admin:x@10.20.40.11:554/user=admin_password=FAKEpw9_channel=1_stream=0'
    );
  });

  it('percent-encodes an @ in the password so a path-cred URL still parses (regression: prod digest cameras)', () => {
    // Mirrors the real-world failing camera SHAPE (all values FABRICATED per the
    // file header — documentation IP + fake password): password contains `@`,
    // creds live in the path, DESCRIBE succeeds via Digest but ffprobe 401s unless
    // userinfo is injected. Two invariants: the `@` in the PATH must NOT be read as
    // userinfo (so injection still fires), and the `@` in the PASSWORD MUST become
    // %40 or it breaks the authority.
    const url = 'rtsp://198.51.100.7/user=admin_password=FAKE@pw99_channel=1_stream=0';
    expect(injectRtspCredentials(url, 'admin', 'FAKE@pw99')).toBe(
      'rtsp://admin:FAKE%40pw99@198.51.100.7/user=admin_password=FAKE@pw99_channel=1_stream=0'
    );
  });

  it('leaves the URL untouched when username is empty', () => {
    expect(injectRtspCredentials('rtsp://cam.example/s', '', 'x')).toBe('rtsp://cam.example/s');
  });
});

describe('redactRtsp — scrubs every credential shape, preserves non-secret fields', () => {
  const cases: Array<[string, string, string]> = [
    // [label, input, expected]
    [
      'userinfo credentials',
      'rtsp://admin:S3cretPZ@10.20.40.11:554/Streaming/Channels/101',
      'rtsp://***@10.20.40.11:554/Streaming/Channels/101',
    ],
    [
      'legacy path creds; channel/stream/onvif preserved',
      'rtsp://10.20.40.11:554/user=admin_password=S3cretPZ_channel=1_stream=0&onvif=0.sdp',
      'rtsp://10.20.40.11:554/user=***_password=***_channel=1_stream=0&onvif=0.sdp',
    ],
    [
      'query-string token, non-secret siblings survive',
      'rtsp://h/live?token=abc123def456&resolution=1920x1080&fps=30',
      'rtsp://h/live?token=***&resolution=1920x1080&fps=30',
    ],
    [
      'Authorization header value',
      'DESCRIBE failed: Authorization: Basic dXNlcjpwYXNzd29yZA==',
      'DESCRIBE failed: Authorization: ***',
    ],
    [
      'standalone Bearer token',
      'sent Bearer aaaabbbbccccddddeeee to gateway',
      'sent Bearer *** to gateway',
    ],
    ['standalone Basic token', 'header was Basic dXNlcjpwYXNzd29yZA==', 'header was Basic ***'],
    [
      'nothing secret is left unchanged',
      'DESCRIBE rtsp://cam.example:554/stream1 RTSP/1.0 200 OK',
      'DESCRIBE rtsp://cam.example:554/stream1 RTSP/1.0 200 OK',
    ],
  ];

  it.each(cases)('%s', (_label, input, expected) => {
    expect(redactRtsp(input)).toBe(expected);
  });

  it('returns empty/falsey input unchanged', () => {
    expect(redactRtsp('')).toBe('');
  });

  it('is idempotent', () => {
    const input = 'rtsp://admin:S3cretPZ@10.20.40.11/user=admin_password=S3cretPZ_channel=1';
    const once = redactRtsp(input);
    expect(redactRtsp(once)).toBe(once);
  });

  it('never leaks the raw secret token in any shape', () => {
    const token = 'HUNTER2xyz_marker';
    const shapes = [
      `rtsp://admin:${token}@10.20.40.11/s`,
      `rtsp://10.20.40.11/user=admin_password=${token}_channel=1`,
      `Authorization: Bearer ${token}`,
      `?apikey=${token}`,
    ];
    for (const s of shapes) {
      expect(redactRtsp(s)).not.toContain(token);
    }
  });

  it('redactSecrets is the same scrubber under a broader name', () => {
    expect(redactSecrets).toBe(redactRtsp);
  });
});
