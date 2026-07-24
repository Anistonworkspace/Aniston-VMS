import type { Camera, CameraStatus, CheckType, Diagnosis, Router } from '@prisma/client';
import { onHealthOutcome } from '../incidents/incident.service.js';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { logger } from '../../lib/logger.js';
import { decrypt } from '../../utils/encryption.js';
import {
  type CheckResult,
  ffprobeStream,
  getSimFault,
  rtspDescribe,
  simulateStages,
  tcpProbe,
} from './health.checkers.js';
import {
  applyHysteresis,
  bandForScore,
  diagnose,
  type HysteresisState,
  type StagedResults,
} from './health.diagnosis.js';
import { beat } from './platform.heartbeat.js';
import { registerRepeatableTick, unregisterRepeatableTick } from '../../lib/scheduler.queue.js';
import { resolveCameraSource } from '../playback/mediamtx.adapter.js';

// ─────────────────────────────────────────────────────────────────────────────
// Jittered health scheduler (docs/02-TRD.md §2): every tick, take up to
// HEALTH_CAMS_PER_MINUTE due cameras (least recently checked first), jitter
// each run 0-10 s, retry network failures once, persist per-stage HealthCheck
// rows, update camera status/score/diagnosis with hysteresis, and upsert the
// hourly connection-quality rollup.
// ─────────────────────────────────────────────────────────────────────────────

const HYSTERESIS_KEY = (cameraId: string): string => `health:hysteresis:${cameraId}`;
const LAST_RUN_KEY = (cameraId: string): string => `health:lastrun:${cameraId}`;

// A camera the scheduler will actually probe. The findMany below filters to
// provisioningState 'CONFIGURED', which guarantees the stream config + router
// relation are populated (enforced at the CONFIGURED gate in camera.service.ts).
// Encoding that guarantee here lets the probe pipeline read these fields without
// re-checking nulls the query has already excluded.
export type ConfiguredCameraWithRouter = Camera & {
  router: Router;
  siteId: string;
  mainRtspUrlEncrypted: string;
  rtspUsernameEncrypted: string;
  rtspPasswordEncrypted: string;
  expectedCodec: string;
  expectedResolution: string;
  expectedFps: number;
  expectedBitrateKbps: number;
};

let registered = false;
let running = false;

export function startHealthScheduler(): void {
  if (registered) return;
  registered = true;
  beat('health-scheduler');
  // BullMQ repeatable (restart-safe, one delivery per minute across instances).
  void registerRepeatableTick('health-scheduler', { pattern: '* * * * *' }, async () => {
    beat('health-scheduler');
    await healthTick().catch((err: unknown) =>
      logger.error('Health tick failed', { error: String(err) })
    );
  }).catch((err: unknown) =>
    logger.error('Health scheduler registration failed', { error: String(err) })
  );
  logger.info('Health scheduler started', {
    camsPerMinute: env.HEALTH_CAMS_PER_MINUTE,
    intervalMinutes: env.HEALTH_CHECK_INTERVAL_MINUTES,
    simMode: env.HEALTH_SIM_MODE,
    transport: 'bullmq-repeatable',
  });
  // Kick an immediate first tick so dev environments show data right away.
  void healthTick().catch((err: unknown) =>
    logger.error('Health tick failed', { error: String(err) })
  );
}

export function stopHealthScheduler(): void {
  registered = false;
  unregisterRepeatableTick('health-scheduler');
}

export async function healthTick(): Promise<void> {
  if (running) return; // don't overlap slow ticks
  running = true;
  try {
    const dueBefore = new Date(Date.now() - env.HEALTH_CHECK_INTERVAL_MINUTES * 60_000);
    // Cast is sound: the CONFIGURED filter + `include: router` below guarantee
    // the stream config columns and router relation are non-null on every row.
    const cameras = (await prisma.camera.findMany({
      where: {
        // Only CONFIGURED cameras have stream config to probe. DRAFT cameras
        // (registered, not yet configured/activated) have null RTSP fields, so
        // health-checking them would be meaningless and would spam INVALID_*
        // failures — they are gated out of the scheduler entirely.
        provisioningState: 'CONFIGURED',
        maintenanceMode: false,
        OR: [{ healthChecks: { none: { startedAt: { gt: dueBefore } } } }],
      },
      include: { router: true },
      orderBy: { updatedAt: 'asc' },
      take: env.HEALTH_CAMS_PER_MINUTE,
    })) as ConfiguredCameraWithRouter[];
    if (cameras.length === 0) return;
    await Promise.allSettled(
      cameras.map(
        (cam) =>
          new Promise<void>((resolve) => {
            const jitter = Math.floor(Math.random() * 10_000);
            setTimeout(() => {
              void runCameraCheck(cam)
                .catch((err: unknown) =>
                  logger.error('Camera check failed', {
                    cameraCode: cam.cameraCode,
                    error: String(err),
                  })
                )
                .finally(resolve);
            }, jitter);
          })
      )
    );
  } finally {
    running = false;
  }
}

async function withRetry(fn: () => Promise<CheckResult>): Promise<CheckResult> {
  const first = await fn();
  if (
    first.success ||
    first.errorCode === 'INVALID_CREDENTIALS' ||
    first.errorCode === 'INVALID_STREAM_PATH'
  ) {
    return first;
  }
  await new Promise((r) => setTimeout(r, env.HEALTH_RETRY_DELAY_MS));
  return fn();
}

const skipped = (why: string): CheckResult => ({
  success: false,
  responseTimeMs: 0,
  errorCode: 'SKIPPED',
  errorMessage: why,
});

export async function runStages(cam: ConfiguredCameraWithRouter): Promise<{
  staged: StagedResults;
  signalDbm: number | null;
  // Codec measured on the SUB stream this run (drives the Live Wall transcode
  // decision). `null` = not measured this run — the caller must then leave the
  // persisted value untouched rather than clobbering a known-good codec.
  detectedSubCodec: string | null;
}> {
  const fault = await getSimFault(cam.cameraCode);
  if (env.HEALTH_SIM_MODE) {
    const sim = simulateStages(fault, {
      codec: cam.expectedCodec,
      resolution: cam.expectedResolution,
      fps: cam.expectedFps,
      bitrateKbps: cam.expectedBitrateKbps,
    });
    return {
      staged: {
        routerTcp: sim.routerTcp,
        rtspPort: sim.rtspPort,
        rtspAuth: sim.rtspAuth,
        video: sim.video,
      },
      signalDbm: sim.signalDbm,
      // No real stream to probe — mirror the simulated video codec so sim/dev
      // environments still populate a detected codec (only when video succeeded).
      detectedSubCodec: sim.video.success ? (sim.video.codec ?? null) : null,
    };
  }

  const mainUrl = decrypt(cam.mainRtspUrlEncrypted);
  const username = decrypt(cam.rtspUsernameEncrypted);
  const password = decrypt(cam.rtspPasswordEncrypted);
  const u = new URL(mainUrl);
  const rtspPortNum = u.port ? Number(u.port) : 554;

  // CAMERA-FIRST probe order. The camera's own RTSP endpoint is the
  // authoritative reachability signal: if it answers, the network path THROUGH
  // the router is provably up — regardless of whether the router's HTTPS
  // management port is reachable (it is usually firewalled off the WAN, and
  // publicStaticIp can be stale on a CGNAT/DDNS link). The router management
  // probe is a *diagnosis-label* input only — used solely to tell a site-wide
  // outage apart from a single dead camera when the camera is unreachable — and
  // must NEVER gate/skip the camera stages (that caused false SITE_INTERNET_DOWN
  // storms for cameras that were streaming fine, e.g. verified in VLC).
  const rtspPort = await withRetry(() => tcpProbe(u.hostname, rtspPortNum));
  if (!rtspPort.success) {
    // Camera unreachable — only NOW probe the router management port so
    // diagnose() can distinguish SITE_INTERNET_DOWN from CAMERA_OFFLINE.
    const routerTcp = await withRetry(() =>
      tcpProbe(cam.router.publicStaticIp, cam.router.managementPort)
    );
    return {
      staged: {
        routerTcp,
        rtspPort,
        rtspAuth: skipped('Skipped — camera unreachable'),
        video: skipped('Skipped — camera unreachable'),
      },
      signalDbm: cam.router.signalStrength,
      detectedSubCodec: null,
    };
  }
  // Camera reachable ⇒ the router path is provably up. Synthesize a successful
  // router result so scoring/diagnosis never mislabels a streaming camera as
  // "site internet down" over an unreachable (often firewalled) management port.
  const routerTcp: CheckResult = {
    success: true,
    responseTimeMs: rtspPort.responseTimeMs,
  };
  const rtspAuth = await withRetry(() => rtspDescribe(mainUrl, username, password));
  if (!rtspAuth.success) {
    // Label the skipped video check by the *actual* RTSP failure. Only genuine
    // auth/path rejections are credential problems; a protocol/session/timeout
    // fault (e.g. RTSP 454) must not be reported as "auth failed".
    const authOrPath =
      rtspAuth.errorCode === 'INVALID_CREDENTIALS' || rtspAuth.errorCode === 'INVALID_STREAM_PATH';
    const why = authOrPath
      ? 'Skipped — auth/path failed'
      : `Skipped — RTSP DESCRIBE failed (${rtspAuth.errorCode ?? 'unknown'})`;
    return {
      staged: { routerTcp, rtspPort, rtspAuth, video: skipped(why) },
      signalDbm: cam.router.signalStrength,
      detectedSubCodec: null,
    };
  }
  const authedUrl = new URL(mainUrl);
  authedUrl.username = encodeURIComponent(username);
  authedUrl.password = encodeURIComponent(password);
  const video = await ffprobeStream(authedUrl.toString());

  // DETECTION-AUTHORITATIVE Live Wall: probe the SUB stream (what the wall
  // actually plays) to measure its real codec. The main-stream `video` check
  // above cannot stand in — main and sub can carry different codecs. Auth is
  // already proven (rtspAuth.success), so the sub URL should connect too; a
  // failed/timed-out sub probe yields `null`, which the caller treats as "not
  // measured" and leaves the persisted codec untouched (no clobber on a blip).
  const subProbe = await ffprobeStream(resolveCameraSource(cam, 'LIVE_SUB'));
  const detectedSubCodec = subProbe.success ? (subProbe.codec ?? null) : null;

  return {
    staged: { routerTcp, rtspPort, rtspAuth, video },
    signalDbm: cam.router.signalStrength,
    detectedSubCodec,
  };
}

async function recentSuccessRate(cameraId: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60_000);
  const [total, ok] = await Promise.all([
    prisma.healthCheck.count({
      where: { cameraId, checkType: 'RTSP_PORT', startedAt: { gt: since } },
    }),
    prisma.healthCheck.count({
      where: { cameraId, checkType: 'RTSP_PORT', startedAt: { gt: since }, success: true },
    }),
  ]);
  return total === 0 ? 1 : ok / total;
}

async function siteFailingRatio(siteId: string, excludeCameraId: string): Promise<number> {
  const siblings = await prisma.camera.findMany({
    // DRAFT siblings are never health-checked and sit at status UNKNOWN, which
    // would otherwise be counted as "failing" and poison the site-wide ratio
    // used for hysteresis — restrict to CONFIGURED cameras only.
    where: {
      siteId,
      id: { not: excludeCameraId },
      provisioningState: 'CONFIGURED',
      maintenanceMode: false,
    },
    select: { status: true },
  });
  if (siblings.length === 0) return 1; // only camera at site → assume site-wide
  const failing = siblings.filter((s) => s.status === 'CRITICAL' || s.status === 'UNKNOWN').length;
  return failing / siblings.length;
}

export async function runCameraCheck(cam: ConfiguredCameraWithRouter): Promise<{
  status: CameraStatus;
  healthScore: number;
  diagnosis: string | null;
}> {
  const startedAt = new Date();
  const { staged, signalDbm, detectedSubCodec } = await runStages(cam);

  const [rate, failingRatio] = await Promise.all([
    recentSuccessRate(cam.id),
    siteFailingRatio(cam.siteId, cam.id),
  ]);
  const outcome = diagnose(
    staged,
    { siteFailingRatio: failingRatio, signalDbm, recentSuccessRate: rate },
    {
      codec: cam.expectedCodec,
      resolution: cam.expectedResolution,
      fps: cam.expectedFps,
      bitrateKbps: cam.expectedBitrateKbps,
    }
  );

  // Hysteresis state lives in Redis; losing it just delays a flip by one run.
  const rawState = await redis.get(HYSTERESIS_KEY(cam.id));
  const prevState = rawState ? (JSON.parse(rawState) as HysteresisState) : null;
  const observed = bandForScore(outcome.healthScore);
  const { next, state } = applyHysteresis(cam.status, observed, prevState);
  await redis.set(HYSTERESIS_KEY(cam.id), JSON.stringify(state), 'EX', 24 * 3600);
  await redis.set(LAST_RUN_KEY(cam.id), startedAt.toISOString(), 'EX', 24 * 3600);

  const completedAt = new Date();
  const rows: Array<{ checkType: CheckType; r: CheckResult }> = [
    { checkType: 'ROUTER_TCP', r: staged.routerTcp },
    { checkType: 'RTSP_PORT', r: staged.rtspPort },
    { checkType: 'RTSP_AUTH', r: staged.rtspAuth },
    { checkType: 'VIDEO_VALIDATION', r: staged.video },
  ];

  await prisma.$transaction([
    prisma.healthCheck.createMany({
      data: rows.map(({ checkType, r }) => ({
        cameraId: cam.id,
        checkType,
        startedAt,
        completedAt,
        success: r.success,
        responseTimeMs: r.responseTimeMs,
        errorCode: r.errorCode ?? null,
        errorMessage: r.errorMessage ?? null,
        codec: r.codec ?? null,
        resolution: r.resolution ?? null,
        fps: r.fps ?? null,
        bitrateKbps: r.bitrateKbps ?? null,
        framesReceived: r.framesReceived ?? null,
        signalDbm: checkType === 'ROUTER_TCP' ? signalDbm : null,
        healthScore: checkType === 'VIDEO_VALIDATION' ? outcome.healthScore : null,
      })),
    }),
    prisma.camera.update({
      where: { id: cam.id },
      data: {
        status: next,
        healthScore: outcome.healthScore,
        diagnosis: outcome.allHealthy ? null : outcome.diagnosis,
        ...(outcome.allHealthy ? { lastHealthyAt: completedAt } : {}),
        // Only persist when actually measured this run; null means "not probed"
        // (outage/blip) and must not clobber the last known-good sub codec.
        ...(detectedSubCodec != null ? { detectedSubCodec } : {}),
      },
    }),
  ]);

  await rollupHour(cam.id, startedAt, staged, signalDbm);

  // Stage 4 hook: feed the outcome to the incident engine (confirm/dedup/
  // alert/recover). Alerting must never break the health loop.
  try {
    await onHealthOutcome({
      camera: {
        id: cam.id,
        siteId: cam.siteId,
        cameraCode: cam.cameraCode,
        name: cam.name,
        maintenanceMode: cam.maintenanceMode,
        lastHealthyAt: cam.lastHealthyAt,
      },
      allHealthy: outcome.allHealthy,
      diagnosis: outcome.allHealthy ? null : (outcome.diagnosis as Diagnosis | null),
      healthScore: outcome.healthScore,
      at: completedAt,
    });
  } catch (err) {
    logger.error('Incident engine failed for camera check', {
      cameraId: cam.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    status: next,
    healthScore: outcome.healthScore,
    diagnosis: outcome.allHealthy ? null : outcome.diagnosis,
  };
}

/** Upsert the ConnectionQualityHourly row for the hour containing `at`. */
async function rollupHour(
  cameraId: string,
  at: Date,
  staged: StagedResults,
  signalDbm: number | null
): Promise<void> {
  const hour = new Date(at);
  hour.setMinutes(0, 0, 0);
  const since = hour;
  const until = new Date(hour.getTime() + 3600_000);
  const checks = await prisma.healthCheck.findMany({
    where: { cameraId, checkType: 'RTSP_PORT', startedAt: { gte: since, lt: until } },
    select: { success: true, responseTimeMs: true },
  });
  const latencies = checks
    .map((c) => c.responseTimeMs ?? 0)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const median = latencies.length
    ? latencies[Math.floor(latencies.length / 2)]
    : staged.rtspPort.responseTimeMs;
  const jitter =
    latencies.length > 1
      ? Math.round(
          latencies.slice(1).reduce((acc, v, i) => acc + Math.abs(v - latencies[i]), 0) /
            (latencies.length - 1)
        )
      : 0;
  const successRate = checks.length
    ? checks.filter((c) => c.success).length / checks.length
    : staged.rtspPort.success
      ? 1
      : 0;

  await prisma.connectionQualityHourly.upsert({
    where: { cameraId_hour: { cameraId, hour } },
    create: {
      cameraId,
      hour,
      successRate,
      medianLatencyMs: median,
      jitterMs: jitter,
      minSignalDbm: signalDbm,
    },
    update: {
      successRate,
      medianLatencyMs: median,
      jitterMs: jitter,
      ...(signalDbm !== null ? { minSignalDbm: { set: signalDbm } } : {}),
    },
  });
}
