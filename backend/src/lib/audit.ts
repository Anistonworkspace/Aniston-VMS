import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { logger } from './logger.js';

export interface AuditParams {
  userId?: string | null;
  action: string; // dot-namespaced, e.g. "auth.login", "camera.move_zone"
  entityType: string;
  entityId: string;
  // Zone/site the acted-on entity belongs to — lets the audit trail be filtered
  // by the same RBAC scope as the rest of the app (nullable for global actions).
  siteId?: string | null;
  zoneId?: string | null;
  oldValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
  ipAddress?: string | null;
}

function toData(p: AuditParams): Prisma.AuditLogUncheckedCreateInput {
  return {
    userId: p.userId ?? null,
    action: p.action,
    entityType: p.entityType,
    entityId: p.entityId,
    siteId: p.siteId ?? null,
    zoneId: p.zoneId ?? null,
    oldValue: p.oldValue,
    newValue: p.newValue,
    ipAddress: p.ipAddress ?? '0.0.0.0',
  };
}

// Transactional audit — writes the audit row inside the caller's transaction so
// it commits atomically with the mutation it records (all-or-nothing). Use this
// from any service that already runs its state change in `prisma.$transaction`.
export async function auditWithinTx(tx: Prisma.TransactionClient, p: AuditParams): Promise<void> {
  await tx.auditLog.create({ data: toData(p) });
}

// Best-effort audit for non-transactional (mostly request-scoped) callers.
// Failures are logged, never thrown — an audit write must not break the request
// that triggered it.
export async function audit(req: Request, p: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: toData({ ...p, ipAddress: p.ipAddress ?? req.ip ?? '0.0.0.0' }),
    });
  } catch (err) {
    logger.error('[audit] failed to write audit log', {
      action: p.action,
      entityType: p.entityType,
      entityId: p.entityId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
