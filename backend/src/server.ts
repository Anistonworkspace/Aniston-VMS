import http from 'node:http';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';
import { startHealthScheduler, stopHealthScheduler } from './modules/health/health.scheduler.js';
import {
  startSnapshotScheduler,
  stopSnapshotScheduler,
} from './modules/snapshots/snapshot.scheduler.js';
import {
  startEscalationWorker,
  stopEscalationWorker,
} from './modules/incidents/escalation.worker.js';
import { startClipExportWorker, stopClipExportWorker } from './modules/clips/clip.worker.js';
import { startSelfMonitor, stopSelfMonitor } from './modules/health/platform.service.js';
import { startStreamReaper, stopStreamReaper } from './modules/playback/playback.reaper.js';
import { startSchedulerWorker, stopSchedulerWorker } from './lib/scheduler.queue.js';
import { initRealtime } from './lib/realtime.js';

// ─────────────────────────────────────────────────────────────────────────────
// Generic skeleton server. Boots an Express app with a health check and nothing
// else. Build your API by adding feature routers in app.ts — use `/new-module`
// or `/build-loop` in Claude Code, which follow .claude/skills/skill-mvc-patterns.md.
// ─────────────────────────────────────────────────────────────────────────────

function main(): void {
  const app = createApp();
  const httpServer = http.createServer(app);

  httpServer.listen(env.PORT, () => {
    logger.info('Server started', {
      port: env.PORT,
      health: `http://localhost:${env.PORT}/api/health`,
    });
    if (env.NODE_ENV !== 'test') {
      // One BullMQ Worker executes ALL registered repeatable ticks
      // (lib/scheduler.queue.ts) — restart-safe + multi-instance safe.
      startSchedulerWorker();
    }
    if (env.HEALTH_SCHEDULER_ENABLED && env.NODE_ENV !== 'test') {
      startHealthScheduler();
    }
    if (env.SNAPSHOT_SCHEDULER_ENABLED && env.NODE_ENV !== 'test') {
      startSnapshotScheduler();
    }
    if (env.ESCALATION_WORKER_ENABLED && env.NODE_ENV !== 'test') {
      startEscalationWorker();
    }
    if (env.CLIP_EXPORT_WORKER_ENABLED && env.NODE_ENV !== 'test') {
      startClipExportWorker();
    }
    if (env.SOCKET_IO_ENABLED && env.NODE_ENV !== 'test') {
      initRealtime(httpServer);
    }
    if (env.NODE_ENV !== 'test') {
      startStreamReaper(); // force-ends abandoned live-view sessions
      startSelfMonitor(); // Stage 9: watches all worker heartbeats
    }
  });

  const shutdown = (signal: string): void => {
    logger.info('Shutdown signal received', { signal });
    stopHealthScheduler();
    stopSnapshotScheduler();
    stopEscalationWorker();
    stopStreamReaper();
    stopSelfMonitor();
    void stopClipExportWorker();
    void stopSchedulerWorker();
    httpServer.close(() => process.exit(0));
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => {
    logger.error('Unhandled rejection', {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

main();
