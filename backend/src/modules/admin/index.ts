import { Router } from 'express';
import { auditLogRouter } from './audit-log.router.js';
import { escalationRouter } from './escalation.router.js';
import { notificationsRouter } from './notifications.router.js';
import { usersRouter } from './users.router.js';

// Single mount point for every admin sub-resource router in this module.
// Each sub-router already declares its own full leaf paths (e.g. '/users',
// '/escalation-policies', '/zone-alert-recipients', '/notifications',
// '/audit-log'), so this is only responsible for combining them — the
// caller (app.ts, out of scope for this task) decides the base prefix, e.g.:
//   app.use('/api/admin', adminRouter);
export const adminRouter = Router();

adminRouter.use(usersRouter);
adminRouter.use(escalationRouter);
adminRouter.use(notificationsRouter);
adminRouter.use(auditLogRouter);
