import { Router } from 'express';
import type { z } from 'zod';
import { authUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validation.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { audit } from '../../lib/audit.js';
import {
  cameraIdParamsSchema,
  clipIdParamsSchema,
  clipListQuerySchema,
  createClipBodySchema,
} from './clip.schemas.js';
import * as clipService from './clip.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// Clip export API (mounted at /api):
//   POST /cameras/:id/clips   — request a clip export for [startAt,endAt) (OPERATOR+)
//   GET  /clips               — scoped list (?cameraId&status&incidentId&limit)
//   GET  /clips/:id           — detail, incl. signed downloadUrl once DONE
//
// Status transitions (QUEUED → PROCESSING → DONE|FAILED) happen inside
// clip.worker.ts's BullMQ processor, outside any HTTP request — there's no
// Request to hand audit() there, so only the user-triggered create call
// below is audited (same reasoning modules/incidents/escalation.worker.ts
// applies: its ESCALATED events are recorded via incidentEvent rows, not
// audit(), because audit() is bound to Express request context).
// ─────────────────────────────────────────────────────────────────────────────

const OPERATOR_PLUS = ['SUPER_ADMIN', 'PROJECT_ADMIN', 'OPERATOR', 'ENGINEER'] as const;

export const clipRouter = Router();

clipRouter.use(requireAuth);

clipRouter.post(
  '/cameras/:id/clips',
  requireRole(...OPERATOR_PLUS),
  validateRequest({ params: cameraIdParamsSchema, body: createClipBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createClipBodySchema>;
    const data = await clipService.createClipExport(authUser(req), req.params.id, body);
    await audit(req, {
      userId: authUser(req).id,
      action: 'clip.export.request',
      entityType: 'ClipExport',
      entityId: data.id,
      newValue: {
        cameraId: req.params.id,
        startAt: body.startAt,
        endAt: body.endAt,
        incidentId: body.incidentId ?? null,
      },
    });
    res.status(201).json({ success: true, data });
  })
);

clipRouter.get(
  '/clips',
  validateRequest({ query: clipListQuerySchema }),
  asyncHandler(async (req, res) => {
    const filters = req.query as unknown as z.infer<typeof clipListQuerySchema>;
    const data = await clipService.listClipExports(authUser(req), filters);
    res.json({ success: true, data });
  })
);

clipRouter.get(
  '/clips/:id',
  validateRequest({ params: clipIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await clipService.getClipExport(authUser(req), req.params.id);
    res.json({ success: true, data });
  })
);
