import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

export interface AuditParams {
  userId?: string | null;
  action: string; // dot-namespaced, e.g. "auth.login", "camera.move_zone"
  entityType: string;
  entityId: string;
  oldValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
}

// Append-only audit trail (audit_logs). Failures are logged, never thrown —
// an audit write must not break the request that triggered it.
export async function audit(req: Request, p: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: p.userId ?? null,
        action: p.action,
        entityType: p.entityType,
        entityId: p.entityId,
        oldValue: p.oldValue,
        newValue: p.newValue,
        ipAddress: req.ip ?? '0.0.0.0',
      },
    });
  } catch (err) {
    console.error('[audit] failed to write audit log:', err);
  }
}
