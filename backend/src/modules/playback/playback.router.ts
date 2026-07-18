import { Router } from 'express';
import type { z } from 'zod';
import { authUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validation.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { audit } from '../../lib/audit.js';
import {
  cameraIdParamsSchema,
  endSessionBodySchema,
  heartbeatBodySchema,
  segmentsQuerySchema,
  sessionIdParamsSchema,
  sessionListQuerySchema,
  startSessionBodySchema,
} from './playback.schemas.js';
import * as playbackService from './playback.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// Playback / live-view session API (mounted at /api):
//   POST /streams/start                    — begin a LIVE_SUB/LIVE_MAIN/PLAYBACK session
//   POST /streams/:id/heartbeat             — keep-alive (resets STREAM_SESSION_TIMEOUT_SECONDS)
//   POST /streams/:id/end                   — end a session (idempotent)
//   GET  /streams/:id                       — session detail (owner or admin)
//   GET  /streams                           — active sessions across users (OPERATOR+, monitoring)
//   GET  /cameras/:id/recording/segments    — recorded segment timeline (?startAt&endAt&track)
// ─────────────────────────────────────────────────────────────────────────────

const OPERATOR_PLUS = ['SUPER_ADMIN', 'PROJECT_ADMIN', 'OPERATOR', 'ENGINEER'] as const;

export const playbackRouter = Router();

playbackRouter.use(requireAuth);

playbackRouter.post(
  '/streams/start',
  validateRequest({ body: startSessionBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof startSessionBodySchema>;
    const data = await playbackService.startSession(authUser(req), body, req.ip ?? '0.0.0.0');
    await audit(req, {
      userId: authUser(req).id,
      action: 'stream.start',
      entityType: 'StreamSession',
      entityId: data.id,
      newValue: { cameraId: body.cameraId, kind: body.kind },
    });
    res.status(201).json({ success: true, data });
  })
);

playbackRouter.get(
  '/streams',
  requireRole(...OPERATOR_PLUS),
  validateRequest({ query: sessionListQuerySchema }),
  asyncHandler(async (req, res) => {
    const filters = req.query as unknown as z.infer<typeof sessionListQuerySchema>;
    const data = await playbackService.listActiveSessions(authUser(req), filters);
    res.json({ success: true, data });
  })
);

playbackRouter.get(
  '/streams/:id',
  validateRequest({ params: sessionIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await playbackService.getSession(authUser(req), req.params.id);
    res.json({ success: true, data });
  })
);

playbackRouter.post(
  '/streams/:id/heartbeat',
  validateRequest({ params: sessionIdParamsSchema, body: heartbeatBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof heartbeatBodySchema>;
    const data = await playbackService.heartbeat(authUser(req), req.params.id, body);
    await audit(req, {
      userId: authUser(req).id,
      action: 'stream.heartbeat',
      entityType: 'StreamSession',
      entityId: req.params.id,
      newValue: { bytesEstimate: body.bytesEstimate ?? null },
    });
    res.json({ success: true, data });
  })
);

playbackRouter.post(
  '/streams/:id/end',
  validateRequest({ params: sessionIdParamsSchema, body: endSessionBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof endSessionBodySchema>;
    const data = await playbackService.endSession(authUser(req), req.params.id, body);
    await audit(req, {
      userId: authUser(req).id,
      action: 'stream.end',
      entityType: 'StreamSession',
      entityId: req.params.id,
      newValue: { reason: body.reason ?? null },
    });
    res.json({ success: true, data });
  })
);

playbackRouter.get(
  '/cameras/:id/recording/segments',
  validateRequest({ params: cameraIdParamsSchema, query: segmentsQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof segmentsQuerySchema>;
    const data = await playbackService.listSegments(authUser(req), req.params.id, query);
    res.json({ success: true, data });
  })
);
