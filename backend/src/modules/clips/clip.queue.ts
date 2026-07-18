import { Queue } from 'bullmq';
import { bullConnection } from '../../lib/redis.js';

// ─────────────────────────────────────────────────────────────────────────────
// BullMQ queue for clip exports. This is the first BullMQ Queue in the
// codebase — everything else so far (escalation, snapshots) uses the
// setInterval-worker pattern, but clip export is naturally job-shaped (one
// unit of work per requested range, retryable, needs concurrency control via
// CLIP_EXPORT_CONCURRENCY) so it gets a real queue+worker instead.
//
// Split into its own file (rather than living in clip.worker.ts) so
// clip.service.ts can enqueue jobs without importing the worker/processor
// module — avoids a service<->worker import cycle.
// ─────────────────────────────────────────────────────────────────────────────

export const CLIP_EXPORT_QUEUE_NAME = 'clip-export';

export interface ClipExportJobData {
  clipExportId?: string; // present for 'export' jobs, absent for 'prune-retention'
}

export const clipExportQueue = new Queue<ClipExportJobData>(CLIP_EXPORT_QUEUE_NAME, {
  connection: bullConnection,
});

export async function enqueueClipExport(clipExportId: string): Promise<void> {
  await clipExportQueue.add(
    'export',
    { clipExportId },
    { attempts: 1, removeOnComplete: true, removeOnFail: 500 }
  );
}

// Repeatable daily retention sweep (CLIP_EXPORT_RETENTION_DAYS). Scheduled
// once from clip.worker.ts's startClipExportWorker(); the stable jobId keeps
// BullMQ from stacking up duplicate repeatables across process restarts.
export async function scheduleRetentionSweep(): Promise<void> {
  await clipExportQueue.add(
    'prune-retention',
    {},
    {
      repeat: { every: 24 * 60 * 60 * 1000 },
      jobId: 'clip-export-retention-sweep',
    }
  );
}
