import { Queue, Worker, type Job, type RepeatOptions } from 'bullmq';
import { bullConnection } from './redis.js';
import { logger } from './logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// Shared BullMQ harness for all periodic background loops (Stage 9 hardening).
// Replaces the per-module setInterval pattern so every scheduler is:
//   • restart-safe   — repeatables live in Redis via upsertJobScheduler(), so a
//     process restart neither loses nor duplicates the cadence;
//   • multi-instance safe — BullMQ delivers each iteration to exactly ONE
//     Worker across all backend replicas (stable scheduler id = dedup key);
//   • cadence-change safe — upsertJobScheduler(override) replaces the stored
//     repeat options whenever an env interval changes.
//
// Modules register a named tick handler + repeat spec via
// registerRepeatableTick(); server.ts starts ONE Worker on this queue with
// startSchedulerWorker(). Stopping an individual loop (platform.router.ts
// DRILL_MODE "kill worker" demo) just unregisters the local handler — ticks
// still arrive but are skipped, its heartbeat goes stale, and the
// self-monitor raises the expected SELF alert.
// ─────────────────────────────────────────────────────────────────────────────

export const SCHEDULER_QUEUE_NAME = 'vms-schedulers';

type TickHandler = () => Promise<void> | void;

const handlers = new Map<string, TickHandler>();

let queue: Queue | null = null;
let worker: Worker | null = null;

export function schedulerQueue(): Queue {
  if (!queue) {
    queue = new Queue(SCHEDULER_QUEUE_NAME, { connection: bullConnection });
  }
  return queue;
}

/**
 * Register `handler` to run on the given BullMQ repeat spec (cron `pattern`
 * or `every` ms). Idempotent per `name`; safe to call again after a stop.
 */
export async function registerRepeatableTick(
  name: string,
  repeat: RepeatOptions,
  handler: TickHandler
): Promise<void> {
  handlers.set(name, handler);
  await schedulerQueue().upsertJobScheduler(name, repeat, {
    name,
    opts: { removeOnComplete: true, removeOnFail: 100 },
  });
}

/**
 * Stop running `name` ticks in THIS process. The repeatable stays in Redis
 * (another instance may still own the loop); local deliveries become no-ops.
 */
export function unregisterRepeatableTick(name: string): void {
  handlers.delete(name);
}

/** True when this instance currently has a live handler for `name`. */
export function isTickRegistered(name: string): boolean {
  return handlers.has(name);
}

export function startSchedulerWorker(): void {
  if (worker) return;
  worker = new Worker(
    SCHEDULER_QUEUE_NAME,
    async (job: Job) => {
      const handler = handlers.get(job.name);
      if (!handler) {
        // Loop disabled on this instance (env flag off or stopped via
        // /api/platform/workers/:name/stop) — skip quietly.
        return;
      }
      await handler();
    },
    { connection: bullConnection, concurrency: 5 }
  );
  worker.on('failed', (job: Job | undefined, err: Error) => {
    logger.error('Scheduler job failed', { job: job?.name, error: err.message });
  });
  worker.on('error', (err: Error) => {
    logger.error('Scheduler worker error', { error: err.message });
  });
  logger.info('BullMQ scheduler worker started', { queue: SCHEDULER_QUEUE_NAME });
}

export async function stopSchedulerWorker(): Promise<void> {
  handlers.clear();
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
}
