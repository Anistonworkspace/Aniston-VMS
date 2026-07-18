import { Worker, type Job } from 'bullmq';
import { bullConnection } from '../../lib/redis.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import {
  CLIP_EXPORT_QUEUE_NAME,
  scheduleRetentionSweep,
  type ClipExportJobData,
} from './clip.queue.js';
import { pruneClipExports, runClipExportJob } from './clip.service.js';
import { beat } from '../health/platform.heartbeat.js';

// ─────────────────────────────────────────────────────────────────────────────
// BullMQ Worker for clip.queue.ts's 'clip-export' queue. Gated by
// CLIP_EXPORT_WORKER_ENABLED at the call site (server.ts) — see the top of
// clip.queue.ts for why the Queue itself lives in a separate module. Also
// schedules the daily retention-sweep repeatable job on start, so
// CLIP_EXPORT_WORKER_ENABLED is the single switch for "clip exports actually
// get processed and retention actually runs" (no separate scheduler needed).
// ─────────────────────────────────────────────────────────────────────────────

let worker: Worker<ClipExportJobData> | null = null;
let hbTimer: NodeJS.Timeout | null = null;

export function startClipExportWorker(): void {
  if (worker) return;

  worker = new Worker<ClipExportJobData>(
    CLIP_EXPORT_QUEUE_NAME,
    async (job: Job<ClipExportJobData>) => {
      if (job.name === 'prune-retention') {
        await pruneClipExports();
        return;
      }
      if (!job.data.clipExportId) {
        logger.warn('Clip export job missing clipExportId', { jobId: job.id, name: job.name });
        return;
      }
      await runClipExportJob(job.data.clipExportId);
    },
    { connection: bullConnection, concurrency: env.CLIP_EXPORT_CONCURRENCY }
  );

  worker.on('failed', (job, err) => {
    logger.error('Clip export job failed', { jobId: job?.id, error: err.message });
  });
  worker.on('error', (err) => {
    logger.error('Clip export worker error', { error: err.message });
  });

  logger.info('Clip export worker started', { concurrency: env.CLIP_EXPORT_CONCURRENCY });

  // BullMQ workers are event-driven, so heartbeat on a plain interval while up.
  beat('clip-export-worker');
  hbTimer = setInterval(() => beat('clip-export-worker'), 60_000);
  hbTimer.unref();

  void scheduleRetentionSweep().catch((err: unknown) =>
    logger.error('Failed to schedule clip export retention sweep', { error: String(err) })
  );
}

export async function stopClipExportWorker(): Promise<void> {
  if (hbTimer) {
    clearInterval(hbTimer);
    hbTimer = null;
  }
  if (worker) {
    await worker.close();
    worker = null;
  }
}
