import type { CameraStatus, Diagnosis } from '@prisma/client';
import type { CheckResult } from './health.checkers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Root-cause diagnosis engine (docs/02-TRD.md §3). Maps the staged pipeline
// results to one of 7 causes, computes the 0-100 health score, and derives
// CameraStatus with hysteresis (N consecutive observations before flipping).
// ─────────────────────────────────────────────────────────────────────────────

export interface StagedResults {
  routerTcp: CheckResult;
  rtspPort: CheckResult;
  rtspAuth: CheckResult;
  video: CheckResult;
}

export interface SiteContext {
  /** Fraction of this site's cameras whose latest router check also failed (0-1). */
  siteFailingRatio: number;
  /** Router signal strength in dBm (negative; lower = weaker), if known. */
  signalDbm: number | null;
  /** Success rate over the recent check window (0-1) for flap detection. */
  recentSuccessRate: number;
}

export interface Expectations {
  codec: string;
  resolution: string;
  fps: number;
  bitrateKbps: number;
}

export const WEAK_SIGNAL_DBM = -95;
export const UNSTABLE_SUCCESS_RATE = 0.8;
const FPS_TOLERANCE = 0.5; // below 50% of expected → degraded
const BITRATE_TOLERANCE = 0.5;

export const DIAGNOSIS_TEXT: Record<Diagnosis, string> = {
  SITE_INTERNET_DOWN: 'Internet down at site — router unreachable and sibling cameras failing',
  SIM_SIGNAL_ISSUE: 'SIM signal issue — router unreachable with weak signal',
  NETWORK_UNSTABLE: 'Unstable network — checks flapping above failure threshold',
  CAMERA_OFFLINE: 'Camera offline — router online but camera port closed',
  CONFIG_ERROR: 'Configuration error — wrong credentials, path, codec or resolution',
  STREAM_DEGRADED: 'Stream degraded — low FPS/bitrate against expected profile',
  IMAGE_PROBLEM: 'Image problem — stream up but image analysis flagged the view',
};

export interface DiagnosisOutcome {
  diagnosis: Diagnosis | null;
  healthScore: number;
  allHealthy: boolean;
}

export function diagnose(
  staged: StagedResults,
  ctx: SiteContext,
  exp: Expectations
): DiagnosisOutcome {
  const { routerTcp, rtspPort, rtspAuth, video } = staged;

  // Stage 1 — router unreachable
  if (!routerTcp.success) {
    if (ctx.signalDbm !== null && ctx.signalDbm < WEAK_SIGNAL_DBM) {
      return {
        diagnosis: 'SIM_SIGNAL_ISSUE',
        healthScore: score(staged, ctx, exp),
        allHealthy: false,
      };
    }
    if (ctx.siteFailingRatio >= 0.5) {
      return {
        diagnosis: 'SITE_INTERNET_DOWN',
        healthScore: score(staged, ctx, exp),
        allHealthy: false,
      };
    }
    // Router down but siblings fine → treat as unstable path to this router
    return {
      diagnosis: 'NETWORK_UNSTABLE',
      healthScore: score(staged, ctx, exp),
      allHealthy: false,
    };
  }

  // Stage 2 — router ok, camera port closed
  if (!rtspPort.success) {
    if (ctx.recentSuccessRate < UNSTABLE_SUCCESS_RATE) {
      return {
        diagnosis: 'NETWORK_UNSTABLE',
        healthScore: score(staged, ctx, exp),
        allHealthy: false,
      };
    }
    return { diagnosis: 'CAMERA_OFFLINE', healthScore: score(staged, ctx, exp), allHealthy: false };
  }

  // Stage 3 — auth/path failures are configuration problems
  if (!rtspAuth.success) {
    return { diagnosis: 'CONFIG_ERROR', healthScore: score(staged, ctx, exp), allHealthy: false };
  }

  // Stage 4 — video validation
  if (!video.success) {
    if (ctx.recentSuccessRate < UNSTABLE_SUCCESS_RATE) {
      return {
        diagnosis: 'NETWORK_UNSTABLE',
        healthScore: score(staged, ctx, exp),
        allHealthy: false,
      };
    }
    return {
      diagnosis: 'STREAM_DEGRADED',
      healthScore: score(staged, ctx, exp),
      allHealthy: false,
    };
  }

  // Video up — compare against expected profile
  const wrongCodec =
    video.codec !== undefined && video.codec.toUpperCase() !== exp.codec.toUpperCase();
  const wrongRes = video.resolution !== undefined && video.resolution !== exp.resolution;
  if (wrongCodec || wrongRes) {
    return { diagnosis: 'CONFIG_ERROR', healthScore: score(staged, ctx, exp), allHealthy: false };
  }
  const lowFps = video.fps !== undefined && video.fps < exp.fps * FPS_TOLERANCE;
  const lowBitrate =
    video.bitrateKbps !== undefined && video.bitrateKbps < exp.bitrateKbps * BITRATE_TOLERANCE;
  if (lowFps || lowBitrate) {
    return {
      diagnosis: 'STREAM_DEGRADED',
      healthScore: score(staged, ctx, exp),
      allHealthy: false,
    };
  }

  // All stages green — flapping history still downgrades
  if (ctx.recentSuccessRate < UNSTABLE_SUCCESS_RATE) {
    return {
      diagnosis: 'NETWORK_UNSTABLE',
      healthScore: score(staged, ctx, exp),
      allHealthy: false,
    };
  }

  return { diagnosis: null, healthScore: score(staged, ctx, exp), allHealthy: true };
}

// ── Health score: connectivity 40 + stream quality 40 + stability 20 ─────────

export function score(staged: StagedResults, ctx: SiteContext, exp: Expectations): number {
  let s = 0;

  // Connectivity (40): 10 per green stage 1-3, +10 video reachable
  if (staged.routerTcp.success) s += 10;
  if (staged.rtspPort.success) s += 10;
  if (staged.rtspAuth.success) s += 10;
  if (staged.video.success) s += 10;

  // Stream quality (40): fps 20 + bitrate 20 proportional to expected
  if (staged.video.success) {
    const fpsRatio = staged.video.fps !== undefined ? Math.min(1, staged.video.fps / exp.fps) : 1;
    const brRatio =
      staged.video.bitrateKbps !== undefined
        ? Math.min(1, staged.video.bitrateKbps / exp.bitrateKbps)
        : 1;
    s += Math.round(fpsRatio * 20) + Math.round(brRatio * 20);
  }

  // Stability (20): recent success rate
  s += Math.round(Math.max(0, Math.min(1, ctx.recentSuccessRate)) * 20);

  return Math.max(0, Math.min(100, s));
}

// ── Status + hysteresis ──────────────────────────────────────────────────────

export const HEALTHY_MIN_SCORE = 80;
export const WARNING_MIN_SCORE = 50;
/** Consecutive observations of a new band required before status flips. */
export const HYSTERESIS_RUNS = 2;

export function bandForScore(healthScore: number): CameraStatus {
  if (healthScore >= HEALTHY_MIN_SCORE) return 'HEALTHY';
  if (healthScore >= WARNING_MIN_SCORE) return 'WARNING';
  return 'CRITICAL';
}

export interface HysteresisState {
  candidate: CameraStatus;
  runs: number;
}

/**
 * Returns the status to persist plus updated hysteresis state. A camera flips
 * to `candidate` only after HYSTERESIS_RUNS consecutive observations, so a
 * single dropped packet can't bounce HEALTHY→CRITICAL→HEALTHY.
 */
export function applyHysteresis(
  current: CameraStatus,
  observed: CameraStatus,
  prev: HysteresisState | null
): { next: CameraStatus; state: HysteresisState } {
  if (observed === current) {
    return { next: current, state: { candidate: observed, runs: 0 } };
  }
  const runs = prev && prev.candidate === observed ? prev.runs + 1 : 1;
  if (runs >= HYSTERESIS_RUNS || current === 'UNKNOWN') {
    return { next: observed, state: { candidate: observed, runs: 0 } };
  }
  return { next: current, state: { candidate: observed, runs } };
}
