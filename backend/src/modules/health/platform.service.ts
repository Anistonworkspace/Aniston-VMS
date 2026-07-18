import fs from 'node:fs';
import os from 'node:os';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { selfAlertsTotal, workerHeartbeatAgeSeconds } from '../../lib/metrics.js';
import {
  ALERT_KEY,
  beat,
  getHeartbeats,
  WORKER_NAMES,
  type HeartbeatStatus,
  type WorkerName,
} from './platform.heartbeat.js';
import { registerRepeatableTick, unregisterRepeatableTick } from '../../lib/scheduler.queue.js';

// ─────────────────────────────────────────────────────────────────────────────
// Stage 9 — platform self-monitoring (plan §Stage 9: "kill a worker →
// self-alert"). A 30 s loop watches every worker heartbeat; when one goes
// stale it raises a SELF-ALERT (Redis flag + Prometheus counter + error log +
// append-only audit row) and clears it automatically once beats resume.
// GET /api/platform/health aggregates the whole picture for dashboards/drills.
// ─────────────────────────────────────────────────────────────────────────────

const SELF_MONITOR_INTERVAL_MS = 30_000;
/** Don't page about "missing" heartbeats while the process is still warming up. */
const STARTUP_GRACE_SECONDS = 180;

export interface SelfAlert {
  worker: WorkerName;
  message: string;
  raisedAt: string;
}

async function getActiveAlerts(): Promise<SelfAlert[]> {
  const raw = await redis.mget(...WORKER_NAMES.map((n) => ALERT_KEY(n)));
  return raw
    .filter((v): v is string => v !== null)
    .map((v) => JSON.parse(v) as SelfAlert)
    .sort((a, b) => a.raisedAt.localeCompare(b.raisedAt));
}

async function auditSelfAlert(action: string, worker: WorkerName, payload: object): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entityType: 'platform_worker',
        entityId: worker,
        newValue: payload as never,
        ipAddress: 'system',
      },
    });
  } catch (err) {
    logger.warn('Self-alert audit write failed', { worker, error: String(err) });
  }
}

export async function runSelfMonitorTick(): Promise<void> {
  beat('self-monitor');
  const heartbeats = await getHeartbeats();
  const inGrace = process.uptime() < STARTUP_GRACE_SECONDS;

  for (const hb of heartbeats) {
    if (hb.name === 'self-monitor' || hb.status === 'disabled') continue;
    workerHeartbeatAgeSeconds.set({ worker: hb.name }, hb.ageSeconds ?? -1);

    const unhealthy = hb.status === 'stale' || (hb.status === 'missing' && !inGrace);
    const alertRaw = await redis.get(ALERT_KEY(hb.name));

    if (unhealthy && !alertRaw) {
      const alert: SelfAlert = {
        worker: hb.name,
        message:
          hb.ageSeconds === null
            ? 'Worker heartbeat missing — worker never started or Redis was flushed'
            : `Worker heartbeat stale — last beat ${hb.ageSeconds}s ago (expected every ${hb.periodSeconds}s)`,
        raisedAt: new Date().toISOString(),
      };
      await redis.set(ALERT_KEY(hb.name), JSON.stringify(alert));
      selfAlertsTotal.inc({ worker: hb.name });
      logger.error('SELF-ALERT raised: background worker appears down', { ...alert });
      await auditSelfAlert('SELF_ALERT_RAISED', hb.name, alert);
    } else if (!unhealthy && hb.status === 'ok' && alertRaw) {
      await redis.del(ALERT_KEY(hb.name));
      const cleared = { worker: hb.name, clearedAt: new Date().toISOString() };
      logger.info('Self-alert cleared: worker heartbeat recovered', cleared);
      await auditSelfAlert('SELF_ALERT_CLEARED', hb.name, cleared);
    }
  }
}

export interface PlatformHealth {
  status: 'ok' | 'degraded' | 'down';
  checkedAt: string;
  database: 'ok' | 'down';
  redis: 'ok' | 'down';
  workers: HeartbeatStatus[];
  alerts: SelfAlert[];
  clipQueue: Record<string, number> | null;
  disk: { freeMb: number; totalMb: number } | null;
  process: { uptimeSeconds: number; rssMb: number; heapUsedMb: number; node: string };
  system: { hostname: string; loadAvg: number[]; freeMemMb: number; totalMemMb: number };
}

export async function getPlatformHealth(): Promise<PlatformHealth> {
  const [dbOk, redisOk] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(
      () => true,
      () => false
    ),
    redis.ping().then(
      () => true,
      () => false
    ),
  ]);

  const workers = redisOk ? await getHeartbeats() : [];
  const alerts = redisOk ? await getActiveAlerts() : [];

  let clipQueue: Record<string, number> | null = null;
  try {
    const { clipExportQueue } = await import('../clips/clip.queue.js');
    clipQueue = await clipExportQueue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed'
    );
  } catch {
    clipQueue = null;
  }

  let disk: PlatformHealth['disk'] = null;
  try {
    const s = await fs.promises.statfs(env.UPLOAD_DIR);
    disk = {
      freeMb: Math.round((s.bsize * s.bavail) / 1_000_000),
      totalMb: Math.round((s.bsize * s.blocks) / 1_000_000),
    };
  } catch {
    disk = null;
  }

  const anyStale = workers.some((w) => w.status === 'stale' || w.status === 'missing');
  const mem = process.memoryUsage();
  return {
    status: !dbOk || !redisOk ? 'down' : anyStale || alerts.length > 0 ? 'degraded' : 'ok',
    checkedAt: new Date().toISOString(),
    database: dbOk ? 'ok' : 'down',
    redis: redisOk ? 'ok' : 'down',
    workers,
    alerts,
    clipQueue,
    disk,
    process: {
      uptimeSeconds: Math.round(process.uptime()),
      rssMb: Math.round(mem.rss / 1_000_000),
      heapUsedMb: Math.round(mem.heapUsed / 1_000_000),
      node: process.version,
    },
    system: {
      hostname: os.hostname(),
      loadAvg: os.loadavg().map((n) => Math.round(n * 100) / 100),
      freeMemMb: Math.round(os.freemem() / 1_000_000),
      totalMemMb: Math.round(os.totalmem() / 1_000_000),
    },
  };
}

let registered = false;

export function startSelfMonitor(): void {
  if (registered) return;
  registered = true;
  beat('self-monitor');
  void registerRepeatableTick('self-monitor', { every: SELF_MONITOR_INTERVAL_MS }, async () => {
    beat('self-monitor');
    await runSelfMonitorTick().catch((err: unknown) =>
      logger.error('Self-monitor tick failed', { error: String(err) })
    );
  }).catch((err: unknown) =>
    logger.error('Self-monitor registration failed', { error: String(err) })
  );
  logger.info('Self-monitor started', {
    intervalSeconds: SELF_MONITOR_INTERVAL_MS / 1000,
    staleAfter: '3× worker period',
    workers: WORKER_NAMES,
    transport: 'bullmq-repeatable',
  });
}

export function stopSelfMonitor(): void {
  registered = false;
  unregisterRepeatableTick('self-monitor');
}
