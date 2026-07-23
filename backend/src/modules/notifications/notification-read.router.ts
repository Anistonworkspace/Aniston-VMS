import { Router } from 'express';
import { authUser, requireAuth } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validation.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { notificationReadParamsSchema } from './notification-read.schemas.js';
import * as notificationReadService from './notification-read.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// Per-user notification-bell API (mounted at /api):
//   GET  /notifications/me               — caller's recent in-scope incident feed
//                                          (each tagged isRead for this user).
//   GET  /notifications/me/unread-count  — caller's unread badge count.
//   POST /notifications/me/read-all      — mark every in-scope incident read.
//   POST /notifications/me/:incidentId/read — mark one incident read.
//
// Any authenticated role: rows and writes are filtered through the caller's
// UserAccessScope, and every write is keyed to authUser(req).id, so a user can
// only read/mutate their OWN notification state. This router MUST be mounted
// BEFORE the admin notifications router so `/notifications/me` is matched here
// rather than by that router's `/notifications/:id`.
// ─────────────────────────────────────────────────────────────────────────────

export const notificationReadRouter = Router();

notificationReadRouter.use(requireAuth);

notificationReadRouter.get(
  '/notifications/me',
  asyncHandler(async (req, res) => {
    const data = await notificationReadService.getNotificationFeed(authUser(req).id);
    res.json({ success: true, data });
  })
);

notificationReadRouter.get(
  '/notifications/me/unread-count',
  asyncHandler(async (req, res) => {
    const data = await notificationReadService.getUnreadCount(authUser(req).id);
    res.json({ success: true, data });
  })
);

notificationReadRouter.post(
  '/notifications/me/read-all',
  asyncHandler(async (req, res) => {
    const data = await notificationReadService.markAllNotificationsRead(authUser(req).id);
    res.json({ success: true, data });
  })
);

notificationReadRouter.post(
  '/notifications/me/:incidentId/read',
  validateRequest({ params: notificationReadParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await notificationReadService.markNotificationRead(
      authUser(req).id,
      req.params.incidentId
    );
    res.json({ success: true, data });
  })
);
