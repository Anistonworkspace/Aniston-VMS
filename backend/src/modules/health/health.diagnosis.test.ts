import { describe, it, expect } from 'vitest';
import { diagnose, DIAGNOSIS_TEXT, type StagedResults } from './health.diagnosis.js';
import type { CheckResult } from './health.checkers.js';

// Stage-3 (RTSP DESCRIBE) diagnosis mapping. Regression guard for CAM-007:
// a transient RTSP protocol/session/timeout fault (e.g. 454) must NOT be
// diagnosed as CONFIG_ERROR ("wrong credentials, path, codec or resolution").

const ok = (): CheckResult => ({ success: true, responseTimeMs: 5 });
const fail = (errorCode: string): CheckResult => ({
  success: false,
  responseTimeMs: 5,
  errorCode,
  errorMessage: errorCode,
});

// Router + port healthy so diagnose() reaches Stage 3; healthy history so the
// flap/unstable heuristics elsewhere never fire.
const ctx = { siteFailingRatio: 0, signalDbm: null, recentSuccessRate: 1 };
const exp = { codec: 'H264', resolution: '1920x1080', fps: 15, bitrateKbps: 2048 };

function staged(rtspAuth: CheckResult): StagedResults {
  return { routerTcp: ok(), rtspPort: ok(), rtspAuth, video: ok() };
}

describe('diagnose() — Stage 3 RTSP DESCRIBE classification', () => {
  it('genuine bad credentials (INVALID_CREDENTIALS) → CONFIG_ERROR', () => {
    expect(diagnose(staged(fail('INVALID_CREDENTIALS')), ctx, exp).diagnosis).toBe('CONFIG_ERROR');
  });

  it('bad stream path (INVALID_STREAM_PATH) → CONFIG_ERROR', () => {
    expect(diagnose(staged(fail('INVALID_STREAM_PATH')), ctx, exp).diagnosis).toBe('CONFIG_ERROR');
  });

  it('RTSP 454 protocol failure (RTSP_PROTOCOL_FAILURE) → NETWORK_UNSTABLE, NOT CONFIG_ERROR', () => {
    // This is the CAM-007 case: 454 is a transient camera-side protocol/state
    // fault, never a credentials problem.
    const out = diagnose(staged(fail('RTSP_PROTOCOL_FAILURE')), ctx, exp);
    expect(out.diagnosis).toBe('NETWORK_UNSTABLE');
    expect(out.diagnosis).not.toBe('CONFIG_ERROR');
  });

  it('RTSP timeout (TIMEOUT) → NETWORK_UNSTABLE', () => {
    expect(diagnose(staged(fail('TIMEOUT')), ctx, exp).diagnosis).toBe('NETWORK_UNSTABLE');
  });

  it('connection reset (ECONNRESET) → NETWORK_UNSTABLE', () => {
    expect(diagnose(staged(fail('ECONNRESET')), ctx, exp).diagnosis).toBe('NETWORK_UNSTABLE');
  });

  it('the transient-fault diagnosis text never blames credentials', () => {
    // Guards the operator-facing message: a 454/timeout must not surface the
    // "wrong credentials" copy that CONFIG_ERROR carries.
    expect(DIAGNOSIS_TEXT.NETWORK_UNSTABLE).not.toMatch(/credential/i);
    expect(DIAGNOSIS_TEXT.CONFIG_ERROR).toMatch(/credential/i);
  });
});

// Stage-4 (video validation) codec comparison. Regression guard for CAM-009:
// ffprobe reports the sub stream as 'HEVC' while the camera form stores the
// equivalent spelling 'H.265' — the SAME codec. A raw string compare flags this
// as a mismatch and paints a green pipeline (all stages pass, "Video stream
// valid — HEVC 800×448") with a false CONFIG_ERROR ("wrong … codec") verdict.
// Codec spellings MUST be compared through the canonical normalizer (lib/codec),
// the same one the Live Wall transcode decision uses, so the two never disagree.
const video = (codec: string, resolution = '1920x1080'): CheckResult => ({
  success: true,
  responseTimeMs: 5,
  codec,
  resolution,
  fps: 15,
  bitrateKbps: 2048,
});

function stagedVideo(v: CheckResult): StagedResults {
  return { routerTcp: ok(), rtspPort: ok(), rtspAuth: ok(), video: v };
}

describe('diagnose() — Stage 4 codec comparison (canonical normalization)', () => {
  it("ffprobe 'HEVC' vs form 'H.265' is the SAME codec → NOT CONFIG_ERROR", () => {
    const out = diagnose(stagedVideo(video('HEVC')), ctx, { ...exp, codec: 'H.265' });
    expect(out.diagnosis).not.toBe('CONFIG_ERROR');
    expect(out.allHealthy).toBe(true);
  });

  it("ffprobe 'H264' vs form 'H.264' is the SAME codec → NOT CONFIG_ERROR", () => {
    const out = diagnose(stagedVideo(video('H264')), ctx, { ...exp, codec: 'H.264' });
    expect(out.diagnosis).not.toBe('CONFIG_ERROR');
    expect(out.allHealthy).toBe(true);
  });

  it('a genuinely different codec (form H.264, camera emits HEVC) → CONFIG_ERROR', () => {
    const out = diagnose(stagedVideo(video('HEVC')), ctx, { ...exp, codec: 'H.264' });
    expect(out.diagnosis).toBe('CONFIG_ERROR');
  });
});
