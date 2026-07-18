import { Router } from 'express';
import type { z } from 'zod';
import { authUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validation.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as maintenanceService from './maintenance.service.js';
import {
  assignTaskBodySchema,
  createTaskBodySchema,
  createWindowBodySchema,
  idParamsSchema,
  taskListQuerySchema,
  taskStatusBodySchema,
  updateTaskBodySchema,
  updateWindowBodySchema,
  windowListQuerySchema,
} from './maintenance.schemas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Maintenance API (mounted at /api):
//   GET    /maintenance/windows              — scoped list (?siteId&cameraId&state&page&limit)
//   POST   /maintenance/windows              — schedule a window (OPERATOR+; creator = approver)
//   GET    /maintenance/windows/:id          — detail
//   PATCH  /maintenance/windows/:id          — reschedule/edit reason (OPERATOR+, before it starts)
//   DELETE /maintenance/windows/:id          — cancel (PROJECT_ADMIN+, before it starts)
//   GET    /maintenance/tasks                — scoped list (?cameraId&status&type&assignedToId&page&limit)
//   POST   /maintenance/tasks                — create task (OPERATOR+)
//   GET    /maintenance/tasks/:id            — detail
//   PATCH  /maintenance/tasks/:id            — edit assignedToId/notes (OPERATOR+)
//   POST   /maintenance/tasks/:id/assign     — assign engineer (OPERATOR+)
//   POST   /maintenance/tasks/:id/status     — validated status transition (OPERATOR+),
//                                              captures before/after snapshots
// ─────────────────────────────────────────────────────────────────────────────

const OPERATOR_PLUS = ['SUPER_ADMIN', 'PROJECT_ADMIN', 'OPERATOR', 'ENGINEER'] as const;
const ADMIN_PLUS = ['SUPER_ADMIN', 'PROJECT_ADMIN'] as const;

export const maintenanceRouter = Router();

maintenanceRouter.use(requireAuth);

// ── Windows ──────────────────────────────────────────────────────────────────

maintenanceRouter.get(
  '/maintenance/windows',
  validateRequest({ query: windowListQuerySchema }),
  asyncHandler(async (req, res) => {
    const filters = req.query as unknown as z.infer<typeof windowListQuerySchema>;
    const data = await maintenanceService.listWindows(authUser(req).id, filters);
    res.json({ success: true, data });
  })
);

maintenanceRouter.post(
  '/maintenance/windows',
  requireRole(...OPERATOR_PLUS),
  validateRequest({ body: createWindowBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createWindowBodySchema>;
    const data = await maintenanceService.createWindow(authUser(req), body);
    res.status(201).json({ success: true, data });
  })
);

maintenanceRouter.get(
  '/maintenance/windows/:id',
  validateRequest({ params: idParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await maintenanceService.getWindow(authUser(req).id, req.params.id);
    res.json({ success: true, data });
  })
);

maintenanceRouter.patch(
  '/maintenance/windows/:id',
  requireRole(...OPERATOR_PLUS),
  validateRequest({ params: idParamsSchema, body: updateWindowBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof updateWindowBodySchema>;
    const data = await maintenanceService.updateWindow(authUser(req), req.params.id, body);
    res.json({ success: true, data });
  })
);

maintenanceRouter.delete(
  '/maintenance/windows/:id',
  requireRole(...ADMIN_PLUS),
  validateRequest({ params: idParamsSchema }),
  asyncHandler(async (req, res) => {
    await maintenanceService.deleteWindow(authUser(req), req.params.id);
    res.json({ success: true, data: null });
  })
);

// ── Tasks ─────────────────────────────────────────────────────────────────────

maintenanceRouter.get(
  '/maintenance/tasks',
  validateRequest({ query: taskListQuerySchema }),
  asyncHandler(async (req, res) => {
    const filters = req.query as unknown as z.infer<typeof taskListQuerySchema>;
    const data = await maintenanceService.listTasks(authUser(req).id, filters);
    res.json({ success: true, data });
  })
);

maintenanceRouter.post(
  '/maintenance/tasks',
  requireRole(...OPERATOR_PLUS),
  validateRequest({ body: createTaskBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createTaskBodySchema>;
    const data = await maintenanceService.createTask(authUser(req), body);
    res.status(201).json({ success: true, data });
  })
);

maintenanceRouter.get(
  '/maintenance/tasks/:id',
  validateRequest({ params: idParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await maintenanceService.getTask(authUser(req).id, req.params.id);
    res.json({ success: true, data });
  })
);

maintenanceRouter.patch(
  '/maintenance/tasks/:id',
  requireRole(...OPERATOR_PLUS),
  validateRequest({ params: idParamsSchema, body: updateTaskBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof updateTaskBodySchema>;
    const data = await maintenanceService.updateTask(authUser(req), req.params.id, body);
    res.json({ success: true, data });
  })
);

maintenanceRouter.post(
  '/maintenance/tasks/:id/assign',
  requireRole(...OPERATOR_PLUS),
  validateRequest({ params: idParamsSchema, body: assignTaskBodySchema }),
  asyncHandler(async (req, res) => {
    const { assignedToId } = req.body as z.infer<typeof assignTaskBodySchema>;
    const data = await maintenanceService.assignTask(authUser(req), req.params.id, assignedToId);
    res.json({ success: true, data });
  })
);

maintenanceRouter.post(
  '/maintenance/tasks/:id/status',
  requireRole(...OPERATOR_PLUS),
  validateRequest({ params: idParamsSchema, body: taskStatusBodySchema }),
  asyncHandler(async (req, res) => {
    const { status } = req.body as z.infer<typeof taskStatusBodySchema>;
    const data = await maintenanceService.transitionTaskStatus(
      authUser(req),
      req.params.id,
      status
    );
    res.json({ success: true, data });
  })
);
