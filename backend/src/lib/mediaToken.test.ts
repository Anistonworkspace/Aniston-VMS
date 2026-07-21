import { describe, it, expect } from 'vitest';
import { signMediaPath, verifyMediaToken } from './mediaToken.js';

const PATH = 'live/live-sub/CAM-001/sess-1';

describe('mediaToken', () => {
  it('round-trips a valid signed path', () => {
    const { exp, sig } = signMediaPath(PATH, 300);
    expect(verifyMediaToken(PATH, exp, sig)).toBe(true);
  });

  it('rejects a swapped camera/path (cannot view another camera)', () => {
    const { exp, sig } = signMediaPath(PATH, 300);
    expect(verifyMediaToken('live/live-sub/CAM-999/sess-1', exp, sig)).toBe(false);
  });

  it('rejects a tampered signature', () => {
    const { exp } = signMediaPath(PATH, 300);
    expect(verifyMediaToken(PATH, exp, 'deadbeef')).toBe(false);
  });

  it('rejects a tampered expiry', () => {
    const { exp, sig } = signMediaPath(PATH, 300);
    expect(verifyMediaToken(PATH, exp + 1, sig)).toBe(false);
  });

  it('rejects an expired token', () => {
    const { exp, sig } = signMediaPath(PATH, -5); // already in the past
    expect(verifyMediaToken(PATH, exp, sig)).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(verifyMediaToken(PATH, Number.NaN, 'x')).toBe(false);
    expect(verifyMediaToken(PATH, 0, '')).toBe(false);
  });
});
