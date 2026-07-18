import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { captureAll, pruneSnapshots } from './snapshot.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// Stage 3 snapshot scheduler: SUB frames every SNAPSHOT_SUB_INTERVAL_MINUTES,
// EVIDENCE frames at the top of each hour, retention pass once a day (~03:10
// IST / 21:40 UTC). Minute-resolution setInterval keeps it drift-free enough
// for the sim fleet; BullMQ takes over when real capture workers land.
// ─────────────────────────────────────────────────────────────────────────────

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startSnapshotScheduler(): void {
  if (timer) return;
  timer = setInterval(() => {
    void tick().catch((err: unknown) =>
      logger.error('Snapshot tick failed', { error: String(err) })
    );
  }, 60_000);
  timer.unref();
  logger.info('Snapshot scheduler started', {
    subIntervalMinutes: env.SNAPSHOT_SUB_INTERVAL_MINUTES,
    retentionDays: env.SNAPSHOT_RETENTION_DAYS,
  });
  // Seed both kinds immediately so dev environments show strips/grids right away.
  void bootstrap().catch((err: unknown) =>
    logger.error('Snapshot bootstrap failed', { error: String(err) })
  );
}

export function stopSnapshotScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

async function bootstrap(): Promise<void> {
  const sub = await captureAll('SUB');
  const evidence = await captureAll('EVIDENCE');
  logger.info('Snapshot bootstrap sweep complete', { sub, evidence });
}

async function tick(): Promise<void> {
  if (running) return; // don't overlap slow sweeps
  running = true;
  try {
    const now = new Date();
    const minute = now.getUTCMinutes();
    if (minute === 0) {
      const result = await captureAll('EVIDENCE', now);
      logger.info('Hourly evidence sweep complete', { ...result });
    } else if (minute % env.SNAPSHOT_SUB_INTERVAL_MINUTES === 0) {
      const result = await captureAll('SUB', now);
      logger.info('Sub snapshot sweep complete', { ...result });
    }
    if (now.getUTCHours() === 21 && minute === 40) {
      await pruneSnapshots(now);
    }
  } finally {
    running = false;
  }
}
