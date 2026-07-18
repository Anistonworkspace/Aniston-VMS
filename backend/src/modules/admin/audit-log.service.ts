import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import type { AuditLogListQuery } from './audit-log.schemas.js';

// Admin API — read-only audit trail (append-only audit_logs, written via
// backend/src/lib/audit.ts#audit() from every mutating endpoint in this
// module and elsewhere). Not zone-scoped: only AUDITOR/SUPER_ADMIN can read
// it at all (enforced in audit-log.router.ts), and compliance review needs
// the full cross-zone trail, not a scoped subset.

export async function listAuditLog(filters: AuditLogListQuery) {
  const { page, limit, entityType, entityId, userId, action, startDate, endDate } = filters;

  const where: Prisma.AuditLogWhereInput = {
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
    ...(userId ? { userId } : {}),
    ...(action ? { action } : {}),
    ...(startDate || endDate
      ? {
          createdAt: {
            ...(startDate ? { gte: new Date(startDate) } : {}),
            ...(endDate ? { lte: new Date(endDate) } : {}),
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
