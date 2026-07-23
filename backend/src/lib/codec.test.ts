import { describe, it, expect } from 'vitest';
import { normalizeCodec, isBrowserPlayableCodec } from './codec.js';

// ─────────────────────────────────────────────────────────────────────────────
// The Live Wall bug this guards against: the transcode decision compared a
// *detected* codec (ffprobe emits 'H264' / 'HEVC' — uppercased codec_name, no
// dot) against a set spelled 'H.264' (with a dot, the operator/form spelling).
// A raw string compare therefore both (a) let HEVC through as if playable when
// the wrong field was trusted, and (b) would have transcoded plain H.264 once
// the detected value was trusted. Normalization is the single source of truth.

describe('normalizeCodec', () => {
  it('collapses every H.264 spelling to canonical H264', () => {
    for (const raw of ['H264', 'h264', 'H.264', 'h.264', 'AVC', 'avc1', 'AVC1', 'H-264', 'H 264', 'x264']) {
      expect(normalizeCodec(raw)).toBe('H264');
    }
  });

  it('collapses every HEVC/H.265 spelling to canonical HEVC', () => {
    for (const raw of ['HEVC', 'hevc', 'H.265', 'h265', 'H265', 'hvc1', 'HEV1', 'x265', '  HEVC ']) {
      expect(normalizeCodec(raw)).toBe('HEVC');
    }
  });

  it('returns null for empty / unknown input (caller decides the fail-safe)', () => {
    expect(normalizeCodec(null)).toBeNull();
    expect(normalizeCodec(undefined)).toBeNull();
    expect(normalizeCodec('')).toBeNull();
    expect(normalizeCodec('   ')).toBeNull();
    expect(normalizeCodec('totally-unknown-codec')).toBeNull();
  });
});

describe('isBrowserPlayableCodec', () => {
  it('treats any H.264 spelling as browser-playable (pass-through)', () => {
    for (const raw of ['H264', 'H.264', 'avc1', 'H 264']) {
      expect(isBrowserPlayableCodec(raw)).toBe(true);
    }
  });

  it('treats HEVC/H.265 as NOT browser-playable (must transcode)', () => {
    for (const raw of ['HEVC', 'H.265', 'H265', 'hvc1']) {
      expect(isBrowserPlayableCodec(raw)).toBe(false);
    }
  });

  it('FAILS SAFE: unknown / null / undetected codec is NOT playable → transcode', () => {
    expect(isBrowserPlayableCodec(null)).toBe(false);
    expect(isBrowserPlayableCodec(undefined)).toBe(false);
    expect(isBrowserPlayableCodec('')).toBe(false);
    expect(isBrowserPlayableCodec('mystery')).toBe(false);
  });
});
