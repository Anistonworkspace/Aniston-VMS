import { redis } from '../../lib/redis.js';
import { env } from '../../config/env.js';

// ─────────────────────────────────────────────────────────────────────────────
// Stage 9 — worker heartbeat registry (plan §Stage 9, TRD §10 self-monitoring).
// Every background loop calls beat('<name>') on each tick; the self-monitor in
// platform.service.ts raises a SELF-ALERT when a heartbeat goes stale
// (age > STALE_MULTIPLIER × expected period). Kept import-light on purpose:
// worker modules import THIS file, never platform.service.ts, so there are no
// ESM cycles (schedulers → heartbeat; service → heartbeat; router → both).
// ─────────────────────────────────────────────────────────────────────────────

export const WORKERS = {
  'health-scheduler': { periodSeconds: 60, enabled: env.HEALTH_SCHEDULER_ENABLED },
  'snapshot-scheduler': { periodSeconds: 60, enabled: env.SNAPSHOT_SCHEDULER_ENABLED },
  'escalation-worker': {
    periodSeconds: env.ESCALATION_INTERVAL_SECONDS,
    enabled: env.ESCALATION_WORKER_ENABLED,
  },
  'clip-export-worker': { periodSeconds: 60, enabled: env.CLIP_EXPORT_WORKER_ENABLED },
  'self-monitor': { periodSeconds: 30, enabled: true },
} as const;

export type WorkerName = keyof typeof WORKERS;
export const WORKER_NAMES = Object.keys(WORKERS) as WorkerName[];

/** Heartbeat older than period × this ⇒ the worker is considered down. */
export const STALE_MULTIPLIER = 3;

const HB_KEY = (name: WorkerName): string => `platform:hb:${name}`;
export const ALERT_KEY = (name: WorkerName): string => `platform:alert:${name}`;

/** Fire-and-forget: a heartbeat write must never break the worker itself. */
export function beat(name: WorkerName): void {
  void redis.set(HB_KEY(name), new Date().toISOString(), 'EX', 86_400).catch(() => undefined);
}

export interface HeartbeatStatus {
  name: WorkerName;
  enabled: boolean;
  periodSeconds: number;
  lastBeatAt: string | null;
  ageSeconds: number | null;
  status: 'ok' | 'stale' | 'missing' | 'disabled';
}

export async function getHeartbeats(now = Date.now()): Promise<HeartbeatStatus[]> {
  const values = await redis.mget(...WORKER_NAMES.map((n) => HB_KEY(n)));
  return WORKER_NAMES.map((name, i) => {
    const cfg = WORKERS[name];
    const lastBeatAt = values[i] ?? null;
    const ageSeconds = lastBeatAt ? Math.round((now - Date.parse(lastBeatAt)) / 1000) : null;
    let status: HeartbeatStatus['status'];
    if (!cfg.enabled) status = 'disabled';
    else if (ageSeconds === null) status = 'missing';
    else status = ageSeconds > cfg.periodSeconds * STALE_MULTIPLIER ? 'stale' : 'ok';
    return {
      name,
      enabled: cfg.enabled,
      periodSeconds: cfg.periodSeconds,
      lastBeatAt,
      ageSeconds,
      status,
    };
  });
}
