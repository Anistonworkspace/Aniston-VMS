import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { teardownStream } from './mediamtx.adapter.js';
import { registerRepeatableTick, unregisterRepeatableTick } from '../../lib/scheduler.queue.js';

// ─────────────────────────────────────────────────────────────────────────────
// Stream session reaper — BullMQ repeatable tick (lib/scheduler.queue.ts),
// same restart-safe pattern as the other schedulers. Any StreamSession whose
// lastHeartbeatAt is older than STREAM_SESSION_TIMEOUT_SECONDS is considered
// abandoned (browser closed / network dropped without a clean POST
// /streams/:id/end) and is force-ended so it stops counting against
// STREAM_MAX_CONCURRENT_PER_CAMERA.
// ─────────────────────────────────────────────────────────────────────────────

let registered = false;
let running = false;

export function startStreamReaper(): void {
  if (registered) return;
  registered = true;
  const intervalSeconds = Math.max(5, Math.floor(env.STREAM_SESSION_TIMEOUT_SECONDS / 2));
  logger.info('Stream session reaper started', {
    timeoutSeconds: env.STREAM_SESSION_TIMEOUT_SECONDS,
    intervalSeconds,
    transport: 'bullmq-repeatable',
  });
  void registerRepeatableTick('stream-reaper', { every: intervalSeconds * 1000 }, async () => {
    await reapTick();
  }).catch((err: unknown) =>
    logger.error('Stream reaper registration failed', { error: String(err) })
  );
  void reapTick();
}

export function stopStreamReaper(): void {
  registered = false;
  unregisterRepeatableTick('stream-reaper');
}

export async function reapTick(): Promise<void> {
  if (running) return; // don't overlap slow ticks
  running = true;
  try {
    const cutoff = new Date(Date.now() - env.STREAM_SESSION_TIMEOUT_SECONDS * 1000);
    const stale = await prisma.streamSession.findMany({
      where: { endedAt: null, lastHeartbeatAt: { lt: cutoff } },
      select: { id: true, mediamtxPath: true },
    });

    for (const s of stale) {
      await teardownStream(s.mediamtxPath);
      await prisma.streamSession.update({
        where: { id: s.id },
        data: { endedAt: new Date(), endReason: 'timeout' },
      });
    }

    if (stale.length > 0) {
      logger.info('Reaped stale stream sessions', { count: stale.length });
    }
  } catch (err) {
    logger.error('Stream reaper tick failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    running = false;
  }
}
