import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { authUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPlatformHealth } from './platform.service.js';
import { startHealthScheduler, stopHealthScheduler } from './health.scheduler.js';
import { startSnapshotScheduler, stopSnapshotScheduler } from '../snapshots/snapshot.scheduler.js';
import { startEscalationWorker, stopEscalationWorker } from '../incidents/escalation.worker.js';

// ─────────────────────────────────────────────────────────────────────────────
// Stage 9 — platform health + drill-only worker control.
//   GET  /api/platform/health           — full self-monitoring picture
//   POST /api/platform/workers/:name/:action — start/stop a worker loop.
//     Guarded twice: SUPER_ADMIN role AND env.DRILL_MODE=true (the endpoint
//     exists to demo "kill a worker → self-alert" in drills/staging; it is a
//     hard 403 in normal environments).
// ─────────────────────────────────────────────────────────────────────────────

export const platformRouter = Router();
platformRouter.use(requireAuth);

platformRouter.get(
  '/platform/health',
  requireRole('SUPER_ADMIN', 'PROJECT_ADMIN', 'AUDITOR'),
  asyncHandler(async (_req, res) => {
    const data = await getPlatformHealth();
    res.json({ success: true, data });
  })
);

const CONTROLLABLE = {
  'health-scheduler': { start: startHealthScheduler, stop: stopHealthScheduler },
  'snapshot-scheduler': { start: startSnapshotScheduler, stop: stopSnapshotScheduler },
  'escalation-worker': { start: startEscalationWorker, stop: stopEscalationWorker },
} as const;

const workerParamsSchema = z.object({
  name: z.enum(['health-scheduler', 'snapshot-scheduler', 'escalation-worker']),
  action: z.enum(['start', 'stop']),
});

platformRouter.post(
  '/platform/workers/:name/:action',
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    if (!env.DRILL_MODE) {
      res.status(403).json({
        success: false,
        error: {
          code: 'DRILL_MODE_DISABLED',
          message: 'Worker control requires DRILL_MODE=true (drill/staging only)',
        },
      });
      return;
    }
    const parsed = workerParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Unknown worker or action' },
      });
      return;
    }
    const { name, action } = parsed.data;
    CONTROLLABLE[name][action]();
    logger.warn('Drill worker control invoked', { worker: name, action, by: authUser(req).id });
    try {
      await prisma.auditLog.create({
        data: {
          userId: authUser(req).id,
          action: 'PLATFORM_WORKER_CONTROL',
          entityType: 'platform_worker',
          entityId: name,
          newValue: { action },
          ipAddress: req.ip ?? 'unknown',
        },
      });
    } catch (err) {
      logger.warn('Worker-control audit write failed', { error: String(err) });
    }
    res.json({ success: true, data: { worker: name, action } });
  })
);
