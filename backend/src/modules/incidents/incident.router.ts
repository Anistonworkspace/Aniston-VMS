import { Router } from 'express';
import type { z } from 'zod';
import { authUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validation.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  assignBodySchema,
  deliveriesQuerySchema,
  incidentIdParamsSchema,
  incidentListQuerySchema,
  resolveBodySchema,
  statusBodySchema,
} from './incident.schemas.js';
import * as incidentService from './incident.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// Stage 4 incident API (mounted at /api):
//   GET  /incidents                — scoped Kanban list (?status&severity&zoneId&cameraId&limit)
//   GET  /incidents/summary        — count per status (Kanban column badges)
//   GET  /incidents/recent         — open incidents feed (sidebar/topbar)
//   GET  /incidents/:id            — detail + events timeline + notifications
//   POST /incidents/:id/ack        — acknowledge (OPERATOR+)
//   POST /incidents/:id/assign     — assign engineer (OPERATOR+)
//   POST /incidents/:id/status     — { status: INVESTIGATING } (OPERATOR+)
//   POST /incidents/:id/resolve    — RCA + resolution notes (OPERATOR+)
//   POST /incidents/:id/close      — final close (PROJECT_ADMIN+)
//   GET  /alerts/deliveries        — notification delivery log (?limit)
// ─────────────────────────────────────────────────────────────────────────────

const OPERATOR_PLUS = ['SUPER_ADMIN', 'PROJECT_ADMIN', 'OPERATOR', 'ENGINEER'] as const;

export const incidentRouter = Router();

incidentRouter.use(requireAuth);

incidentRouter.get(
  '/incidents',
  validateRequest({ query: incidentListQuerySchema }),
  asyncHandler(async (req, res) => {
    const filters = req.query as unknown as z.infer<typeof incidentListQuerySchema>;
    const data = await incidentService.listIncidents(authUser(req).id, filters);
    res.json({ success: true, data });
  })
);

incidentRouter.get(
  '/incidents/summary',
  asyncHandler(async (req, res) => {
    const data = await incidentService.getIncidentSummary(authUser(req).id);
    res.json({ success: true, data });
  })
);

incidentRouter.get(
  '/incidents/recent',
  asyncHandler(async (req, res) => {
    const data = await incidentService.listRecentIncidents(authUser(req).id);
    res.json({ success: true, data });
  })
);

incidentRouter.get(
  '/incidents/:id',
  validateRequest({ params: incidentIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await incidentService.getIncidentDetail(authUser(req).id, req.params.id);
    res.json({ success: true, data });
  })
);

incidentRouter.post(
  '/incidents/:id/ack',
  requireRole(...OPERATOR_PLUS),
  validateRequest({ params: incidentIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await incidentService.ackIncident(req.params.id, authUser(req));
    res.json({ success: true, data });
  })
);

incidentRouter.post(
  '/incidents/:id/assign',
  requireRole(...OPERATOR_PLUS),
  validateRequest({ params: incidentIdParamsSchema, body: assignBodySchema }),
  asyncHandler(async (req, res) => {
    const { assignedToId } = req.body as z.infer<typeof assignBodySchema>;
    const data = await incidentService.assignIncident(req.params.id, assignedToId, authUser(req));
    res.json({ success: true, data });
  })
);

incidentRouter.post(
  '/incidents/:id/status',
  requireRole(...OPERATOR_PLUS),
  validateRequest({ params: incidentIdParamsSchema, body: statusBodySchema }),
  asyncHandler(async (req, res) => {
    const data = await incidentService.markInvestigating(req.params.id, authUser(req));
    res.json({ success: true, data });
  })
);

incidentRouter.post(
  '/incidents/:id/resolve',
  requireRole(...OPERATOR_PLUS),
  validateRequest({ params: incidentIdParamsSchema, body: resolveBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof resolveBodySchema>;
    const data = await incidentService.resolveIncident(req.params.id, body, authUser(req));
    res.json({ success: true, data });
  })
);

incidentRouter.post(
  '/incidents/:id/close',
  requireRole('SUPER_ADMIN', 'PROJECT_ADMIN'),
  validateRequest({ params: incidentIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await incidentService.closeIncident(req.params.id, authUser(req));
    res.json({ success: true, data });
  })
);

incidentRouter.get(
  '/alerts/deliveries',
  validateRequest({ query: deliveriesQuerySchema }),
  asyncHandler(async (req, res) => {
    const { limit } = req.query as unknown as z.infer<typeof deliveriesQuerySchema>;
    const data = await incidentService.listAlertDeliveries(authUser(req).id, limit);
    res.json({ success: true, data });
  })
);
