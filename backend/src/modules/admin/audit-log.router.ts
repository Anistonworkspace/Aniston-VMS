import { Router } from 'express';
import type { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validation.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { auditLogListQuerySchema } from './audit-log.schemas.js';
import * as auditLogService from './audit-log.service.js';

// Read-only compliance trail — AUDITOR/SUPER_ADMIN only. Not zone-scoped (see
// audit-log.service.ts comment): a compliance reviewer needs the full
// cross-zone trail, and AUDITOR has no other write/scope capability anyway.
const AUDIT_ROLES = ['SUPER_ADMIN', 'AUDITOR'] as const;

export const auditLogRouter = Router();

auditLogRouter.use(requireAuth);

auditLogRouter.get(
  '/audit-log',
  requireRole(...AUDIT_ROLES),
  validateRequest({ query: auditLogListQuerySchema }),
  asyncHandler(async (req, res) => {
    const filters = req.query as unknown as z.infer<typeof auditLogListQuerySchema>;
    const data = await auditLogService.listAuditLog(filters);
    res.json({ success: true, data });
  })
);
