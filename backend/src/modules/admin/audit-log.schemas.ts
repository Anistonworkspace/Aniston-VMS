import { z } from 'zod';
import { DateRangeSchema, PaginationSchema } from '@aniston-vms/shared';

// Admin API — read-only audit trail query (AUDITOR/SUPER_ADMIN only).
// Field names match prisma/schema.prisma `model AuditLog` exactly.

export const auditLogListQuerySchema = PaginationSchema.merge(DateRangeSchema).extend({
  entityType: z.string().trim().min(1).max(100).optional(),
  entityId: z.string().trim().min(1).max(200).optional(),
  userId: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(200).optional(),
});
export type AuditLogListQuery = z.infer<typeof auditLogListQuerySchema>;
