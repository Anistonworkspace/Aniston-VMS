import { Router } from 'express';
import type { z } from 'zod';
import { authUser, requireAuth } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validation.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  notificationIdParamsSchema,
  notificationListQuerySchema,
} from './notifications.schemas.js';
import * as notificationsService from './notifications.service.js';

// Read-only delivery log — any authenticated role, but every row is filtered
// through the caller's UserAccessScope (via the parent incident's zone), so
// there's no role gate here beyond requireAuth.

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/notifications',
  validateRequest({ query: notificationListQuerySchema }),
  asyncHandler(async (req, res) => {
    const filters = req.query as unknown as z.infer<typeof notificationListQuerySchema>;
    const data = await notificationsService.listNotifications(authUser(req), filters);
    res.json({ success: true, data });
  })
);

notificationsRouter.get(
  '/notifications/:id',
  validateRequest({ params: notificationIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await notificationsService.getNotificationById(req.params.id, authUser(req));
    res.json({ success: true, data });
  })
);
