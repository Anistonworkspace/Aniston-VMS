// ─────────────────────────────────────────────────────────────────────────────
// Shared video-codec normalizer — the ONE canonical mapping from the many codec
// spellings that cameras, ffprobe, and operators emit down to a stable token.
// Used by the health probe (detection → Camera.detectedSubCodec), the
// playback / Live Wall transcode decision, and health diagnosis so they can
// never disagree about whether a stream is browser-playable.
//
// Why this exists: ffprobe reports `codec_name` uppercased with no separator
// (e.g. 'H264', 'HEVC'); operators type 'H.264' / 'H.265' into the camera form;
// RTP/fourcc paths surface 'AVC1' / 'HVC1'. A raw string compare such as
// `new Set(['H.264']).has(detected)` silently mismatches a *detected* 'H264',
// which is exactly how HEVC sub streams reached the Live Wall un-transcoded.
// Normalize first, compare second.
// ─────────────────────────────────────────────────────────────────────────────

export type CanonicalCodec = 'H264' | 'HEVC' | 'AV1' | 'VP9' | 'VP8' | 'MJPEG';

// Codecs a browser can decode from MediaMTX's HLS/WebRTC output today. H.264 has
// universal support; nothing else is guaranteed across the browsers we target,
// so the Live Wall transcodes everything else to H.264 on demand.
const BROWSER_PLAYABLE = new Set<CanonicalCodec>(['H264']);

// Keys are the *separator-stripped, uppercased* form (see normalizeCodec), so
// 'H.264', 'h-264' and 'H 264' all collapse to the 'H264' key before lookup.
const ALIASES: Record<string, CanonicalCodec> = {
  H264: 'H264',
  AVC: 'H264',
  AVC1: 'H264',
  X264: 'H264',
  HEVC: 'HEVC',
  H265: 'HEVC',
  HVC1: 'HEVC',
  HEV1: 'HEVC',
  X265: 'HEVC',
  AV1: 'AV1',
  AV01: 'AV1',
  VP9: 'VP9',
  VP09: 'VP9',
  VP8: 'VP8',
  VP80: 'VP8',
  MJPEG: 'MJPEG',
  MJPG: 'MJPEG',
  JPEG: 'MJPEG',
};

/**
 * Map any codec spelling to a canonical token, or `null` when it is empty or
 * unrecognised. Callers decide what an unknown codec means for their path — the
 * Live Wall treats it as "not playable" (fail-safe transcode), never as a skip.
 */
export function normalizeCodec(raw: string | null | undefined): CanonicalCodec | null {
  if (!raw) return null;
  // Uppercase and strip every separator (dot, space, underscore, hyphen) so the
  // form spelling 'H.264' and the ffprobe spelling 'H264' hash to one key.
  const key = raw.trim().toUpperCase().replace(/[\s._-]+/g, '');
  if (!key) return null;
  return ALIASES[key] ?? null;
}

/**
 * True only when the codec is one a browser can decode without transcoding.
 * FAILS SAFE: a null / empty / unknown / undetected codec returns `false`, so
 * the Live Wall transcodes rather than shipping an unplayable stream.
 */
export function isBrowserPlayableCodec(raw: string | null | undefined): boolean {
  const canonical = normalizeCodec(raw);
  return canonical !== null && BROWSER_PLAYABLE.has(canonical);
}
