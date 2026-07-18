import { Router } from 'express';
import type { z } from 'zod';
import { authUser, requireAuth } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validation.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as layoutService from './layout.service.js';
import {
  createLayoutBodySchema,
  idParamsSchema,
  updateLayoutBodySchema,
} from './layout.schemas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Saved-layouts API (mounted at /api) — personal per-user camera grid presets,
// no role restriction beyond being authenticated; every operation is scoped
// to the caller's own rows (requireLayout in layout.service.ts uses
// `where: { id, userId }`, never a client-supplied userId):
//   GET    /saved-layouts       — current user's layouts
//   POST   /saved-layouts       — {name, cameraIds, kind}
//   GET    /saved-layouts/:id
//   PATCH  /saved-layouts/:id
//   DELETE /saved-layouts/:id
// ─────────────────────────────────────────────────────────────────────────────

export const layoutRouter = Router();

layoutRouter.use(requireAuth);

layoutRouter.get(
  '/saved-layouts',
  asyncHandler(async (req, res) => {
    const data = await layoutService.listLayouts(authUser(req).id);
    res.json({ success: true, data });
  })
);

layoutRouter.post(
  '/saved-layouts',
  validateRequest({ body: createLayoutBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createLayoutBodySchema>;
    const data = await layoutService.createLayout(authUser(req).id, body);
    res.status(201).json({ success: true, data });
  })
);

layoutRouter.get(
  '/saved-layouts/:id',
  validateRequest({ params: idParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await layoutService.getLayout(authUser(req).id, req.params.id);
    res.json({ success: true, data });
  })
);

layoutRouter.patch(
  '/saved-layouts/:id',
  validateRequest({ params: idParamsSchema, body: updateLayoutBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof updateLayoutBodySchema>;
    const data = await layoutService.updateLayout(authUser(req).id, req.params.id, body);
    res.json({ success: true, data });
  })
);

layoutRouter.delete(
  '/saved-layouts/:id',
  validateRequest({ params: idParamsSchema }),
  asyncHandler(async (req, res) => {
    await layoutService.deleteLayout(authUser(req).id, req.params.id);
    res.json({ success: true, data: null });
  })
);
