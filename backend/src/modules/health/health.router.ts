import { Router } from 'express';
import { authUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validation.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { cameraIdParamsSchema, checksQuerySchema, qualityQuerySchema } from './health.schemas.js';
import * as healthService from './health.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// Stage 2 health API (mounted at /api):
//   GET  /cameras/health                 — scoped camera list w/ health fields
//   GET  /cameras/:id/health             — detail + pipeline + diagnosis text
//   GET  /cameras/:id/health/checks      — raw check history (?hours&checkType)
//   GET  /cameras/:id/health/quality     — hourly rollup series (?hours)
//   POST /cameras/:id/health/run         — manual re-check (OPERATOR+)
//   GET  /zones/health-rollup            — per-zone status counts
// ─────────────────────────────────────────────────────────────────────────────

export const healthRouter = Router();

healthRouter.use(requireAuth);

healthRouter.get(
  '/cameras/health',
  asyncHandler(async (req, res) => {
    const data = await healthService.getCameraHealthList(authUser(req).id);
    res.json({ success: true, data });
  })
);

healthRouter.get(
  '/cameras/:id/health',
  validateRequest({ params: cameraIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await healthService.getCameraHealth(authUser(req).id, req.params.id);
    res.json({ success: true, data });
  })
);

healthRouter.get(
  '/cameras/:id/health/checks',
  validateRequest({ params: cameraIdParamsSchema, query: checksQuerySchema }),
  asyncHandler(async (req, res) => {
    const { hours, checkType } = req.query as unknown as { hours: number; checkType?: string };
    const data = await healthService.getCameraChecks(
      authUser(req).id,
      req.params.id,
      hours,
      checkType
    );
    res.json({ success: true, data });
  })
);

healthRouter.get(
  '/cameras/:id/health/quality',
  validateRequest({ params: cameraIdParamsSchema, query: qualityQuerySchema }),
  asyncHandler(async (req, res) => {
    const { hours } = req.query as unknown as { hours: number };
    const data = await healthService.getCameraQuality(authUser(req).id, req.params.id, hours);
    res.json({ success: true, data });
  })
);

healthRouter.post(
  '/cameras/:id/health/run',
  requireRole('SUPER_ADMIN', 'PROJECT_ADMIN', 'OPERATOR', 'ENGINEER'),
  validateRequest({ params: cameraIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await healthService.runCameraCheckNow(authUser(req).id, req.params.id);
    res.json({ success: true, data });
  })
);

healthRouter.get(
  '/zones/health-rollup',
  asyncHandler(async (req, res) => {
    const data = await healthService.getZoneRollups(authUser(req).id);
    res.json({ success: true, data });
  })
);
