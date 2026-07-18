import { Router } from 'express';
import { authUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validation.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  cameraIdParamsSchema,
  snapshotFileQuerySchema,
  snapshotGridQuerySchema,
  snapshotIdParamsSchema,
  snapshotListQuerySchema,
} from './snapshot.schemas.js';
import * as snapshotService from './snapshot.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// Stage 3 snapshot API (mounted at /api):
//   GET  /snapshots/:id/file             — signed-URL file serving (no session;
//                                          the HMAC in the query IS the auth)
//   GET  /cameras/:id/snapshots          — strip (?hours&kind&limit)
//   GET  /cameras/:id/snapshots/grid     — hourly grid for a day (?date)
//   POST /cameras/:id/snapshots/capture  — manual capture (OPERATOR+)
// ─────────────────────────────────────────────────────────────────────────────

// Public router — mounted at /api BEFORE any router that applies a
// router-level requireAuth (e.g. healthRouter), otherwise that middleware
// intercepts /api/snapshots/:id/file and 401s <img> requests, which cannot
// send Bearer headers. Access control here is the short-lived HMAC signature.
export const snapshotFileRouter = Router();

snapshotFileRouter.get(
  '/snapshots/:id/file',
  validateRequest({ params: snapshotIdParamsSchema, query: snapshotFileQuerySchema }),
  asyncHandler(async (req, res) => {
    const { v, exp, sig } = req.query as unknown as {
      v: 'orig' | 'thumb';
      exp: number;
      sig: string;
    };
    const file = await snapshotService.getSnapshotFile(req.params.id, v, exp, sig);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.sendFile(file);
  })
);

export const snapshotRouter = Router();

snapshotRouter.use(requireAuth);

snapshotRouter.get(
  '/cameras/:id/snapshots',
  validateRequest({ params: cameraIdParamsSchema, query: snapshotListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { hours, kind, limit } = req.query as unknown as {
      hours: number;
      kind?: 'SUB' | 'EVIDENCE';
      limit: number;
    };
    const data = await snapshotService.listSnapshots(
      authUser(req).id,
      req.params.id,
      hours,
      kind,
      limit
    );
    res.json({ success: true, data });
  })
);

snapshotRouter.get(
  '/cameras/:id/snapshots/grid',
  validateRequest({ params: cameraIdParamsSchema, query: snapshotGridQuerySchema }),
  asyncHandler(async (req, res) => {
    const { date } = req.query as unknown as { date?: string };
    const data = await snapshotService.getSnapshotGrid(authUser(req).id, req.params.id, date);
    res.json({ success: true, data });
  })
);

snapshotRouter.post(
  '/cameras/:id/snapshots/capture',
  requireRole('SUPER_ADMIN', 'PROJECT_ADMIN', 'OPERATOR', 'ENGINEER'),
  validateRequest({ params: cameraIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await snapshotService.captureNow(authUser(req).id, req.params.id);
    res.status(201).json({ success: true, data });
  })
);
