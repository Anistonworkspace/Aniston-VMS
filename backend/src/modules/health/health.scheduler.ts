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

// ─────────────────────────────────────────────────────────────────────────────
// Jittered health scheduler (docs/02-TRD.md §2): every tick, take up to
// HEALTH_CAMS_PER_MINUTE due cameras (least recently checked first), jitter
// each run 0-10 s, retry network failures once, persist per-stage HealthCheck
// rows, update camera status/score/diagnosis with hysteresis, and upsert the
// hourly connection-quality rollup.
// ─────────────────────────────────────────────────────────────────────────────

const HYSTERESIS_KEY = (cameraId: string): string => `health:hysteresis:${cameraId}`;
const LAST_RUN_KEY = (cameraId: string): string => `health:lastrun:${cameraId}`;

type CameraWithRouter = Camera & { router: Router };

let registered = false;
let running = false;

export function startHealthScheduler(): void {
  if (registered) return;
  registered = true;
  beat('health-scheduler');
  // BullMQ repeatable (restart-safe, one delivery per minute across instances).
  void registerRepeatableTick('health-scheduler', { pattern: '* * * * *' }, async () => {
    beat('health-scheduler');
    await tick().catch((err: unknown) =>
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
  void tick().catch((err: unknown) => logger.error('Health tick failed', { error: String(err) }));
}

export function stopHealthScheduler(): void {
  registered = false;
  unregisterRepeatableTick('health-scheduler');
}

async function tick(): Promise<void> {
  if (running) return; // don't overlap slow ticks
  running = true;
  try {
    const dueBefore = new Date(Date.now() - env.HEALTH_CHECK_INTERVAL_MINUTES * 60_000);
    const cameras = await prisma.camera.findMany({
      where: {
        maintenanceMode: false,
        OR: [{ healthChecks: { none: { startedAt: { gt: dueBefore } } } }],
      },
      include: { router: true },
      orderBy: { updatedAt: 'asc' },
      take: env.HEALTH_CAMS_PER_MINUTE,
    });
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

async function runStages(
  cam: CameraWithRouter
): Promise<{ staged: StagedResults; signalDbm: number | null }> {
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
    };
  }

  const mainUrl = decrypt(cam.mainRtspUrlEncrypted);
  const username = decrypt(cam.rtspUsernameEncrypted);
  const password = decrypt(cam.rtspPasswordEncrypted);
  const u = new URL(mainUrl);
  const rtspPortNum = u.port ? Number(u.port) : 554;

  const routerTcp = await withRetry(() =>
    tcpProbe(cam.router.publicStaticIp, cam.router.managementPort)
  );
  if (!routerTcp.success) {
    return {
      staged: {
        routerTcp,
        rtspPort: skipped('Skipped — router down'),
        rtspAuth: skipped('Skipped — router down'),
        video: skipped('Skipped — router down'),
      },
      signalDbm: cam.router.signalStrength,
    };
  }
  const rtspPort = await withRetry(() => tcpProbe(u.hostname, rtspPortNum));
  if (!rtspPort.success) {
    return {
      staged: {
        routerTcp,
        rtspPort,
        rtspAuth: skipped('Skipped — camera port closed'),
        video: skipped('Skipped — camera port closed'),
      },
      signalDbm: cam.router.signalStrength,
    };
  }
  const rtspAuth = await withRetry(() => rtspDescribe(mainUrl, username, password));
  if (!rtspAuth.success) {
    return {
      staged: { routerTcp, rtspPort, rtspAuth, video: skipped('Skipped — auth failed') },
      signalDbm: cam.router.signalStrength,
    };
  }
  const authedUrl = new URL(mainUrl);
  authedUrl.username = encodeURIComponent(username);
  authedUrl.password = encodeURIComponent(password);
  const video = await ffprobeStream(authedUrl.toString());
  return { staged: { routerTcp, rtspPort, rtspAuth, video }, signalDbm: cam.router.signalStrength };
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
    where: { siteId, id: { not: excludeCameraId }, maintenanceMode: false },
    select: { status: true },
  });
  if (siblings.length === 0) return 1; // only camera at site → assume site-wide
  const failing = siblings.filter((s) => s.status === 'CRITICAL' || s.status === 'UNKNOWN').length;
  return failing / siblings.length;
}

export async function runCameraCheck(cam: CameraWithRouter): Promise<{
  status: CameraStatus;
  healthScore: number;
  diagnosis: string | null;
}> {
  const startedAt = new Date();
  const { staged, signalDbm } = await runStages(cam);

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
