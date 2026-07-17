# Skill — Audit Log Patterns

Write, query, and display audit logs for compliance. Every create/update/delete must be logged.

---

## Prisma model (already in boilerplate)

```prisma
model AuditLog {
  id             String   @id @default(uuid())
  organizationId String
  actorId        String              // who did it
  action         String              // e.g. 'ITEM_CREATED'
  entity         String              // e.g. 'Item'
  entityId       String?             // the record's ID
  before         Json?               // state before change (for updates)
  after          Json?               // state after change
  ipAddress      String?
  userAgent      String?
  createdAt      DateTime @default(now())

  actor        User         @relation(fields: [actorId], references: [id])
  organization Organization @relation(fields: [organizationId], references: [id])

  @@index([organizationId])
  @@index([actorId])
  @@index([entity, entityId])
  @@index([createdAt])
  @@index([organizationId, createdAt])  // for paginated org-scoped listing
}
```

---

## auditLogger utility (already in boilerplate)

```typescript
// backend/src/utils/auditLogger.ts
import type { Prisma } from '@prisma/client';

interface LogParams {
  action:         string;
  entity:         string;
  entityId?:      string;
  actorId:        string;
  organizationId: string;
  before?:        object;
  after?:         object;
  ipAddress?:     string;
  userAgent?:     string;
}

export const auditLogger = {
  // Pass the transaction client so the log is part of the same transaction
  async log(tx: Prisma.TransactionClient, params: LogParams) {
    await tx.auditLog.create({ data: params });
  },

  // For cases where you need to log outside a transaction
  async logDirect(params: LogParams) {
    await prisma.auditLog.create({ data: params });
  },
};
```

---

## Service — log every state-changing operation

```typescript
// Standard logging pattern in every service method:

// CREATE
const item = await tx.item.create({ data });
await auditLogger.log(tx, {
  action: 'ITEM_CREATED',
  entity: 'Item',
  entityId: item.id,
  actorId: actor.id,
  organizationId: actor.organizationId,
  after: item,                               // full record after creation
});

// UPDATE
const before = await tx.item.findUniqueOrThrow({ where: { id } });
const after  = await tx.item.update({ where: { id }, data: dto });
await auditLogger.log(tx, {
  action: 'ITEM_UPDATED',
  entity: 'Item',
  entityId: id,
  actorId: actor.id,
  organizationId: actor.organizationId,
  before,                                    // state before — for diff view
  after,                                     // state after
});

// DELETE (soft)
await auditLogger.log(tx, {
  action: 'ITEM_DELETED',
  entity: 'Item',
  entityId: id,
  actorId: actor.id,
  organizationId: actor.organizationId,
  before: existingItem,
});

// STATUS CHANGE
await auditLogger.log(tx, {
  action: 'ITEM_APPROVED',
  entity: 'Item',
  entityId: id,
  actorId: actor.id,
  organizationId: actor.organizationId,
  before: { status: 'SUBMITTED' },
  after:  { status: 'APPROVED', approverId: actor.id },
});
```

---

## Audit log action catalog

```typescript
// shared/src/enums.ts — define all actions
export enum AuditAction {
  // Auth
  LOGIN             = 'LOGIN',
  LOGOUT            = 'LOGOUT',
  PASSWORD_CHANGED  = 'PASSWORD_CHANGED',

  // Item
  ITEM_CREATED  = 'ITEM_CREATED',
  ITEM_UPDATED  = 'ITEM_UPDATED',
  ITEM_DELETED  = 'ITEM_DELETED',
  ITEM_RESTORED = 'ITEM_RESTORED',

  // Item workflow
  ITEM_SUBMITTED   = 'ITEM_SUBMITTED',
  ITEM_APPROVED    = 'ITEM_APPROVED',
  ITEM_REJECTED    = 'ITEM_REJECTED',
  ITEM_CANCELLED   = 'ITEM_CANCELLED',

  // Admin
  ROLE_CHANGED      = 'ROLE_CHANGED',
  ORG_SETTINGS_UPDATED = 'ORG_SETTINGS_UPDATED',
}
```

---

## Audit log service — query with filters

```typescript
// backend/src/modules/audit/audit.service.ts
export class AuditService {
  static async list(query: AuditListQuery, actor: AuthUser) {
    // Only SUPER_ADMIN and ADMIN can view audit logs
    if (![UserRole.SUPER_ADMIN, UserRole.ADMIN].includes(actor.role)) {
      throw new ForbiddenError('Audit logs require admin access');
    }

    const { page = 1, limit = 50, entity, entityId, actorId, action, from, to } = query;

    const where: Prisma.AuditLogWhereInput = {
      organizationId: actor.organizationId,
    };

    if (entity)   where.entity   = entity;
    if (entityId) where.entityId = entityId;
    if (actorId)  where.actorId  = actorId;
    if (action)   where.action   = action;
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to   ? { lte: new Date(to)   } : {}),
      };
    }

    const [data, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          actor: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  // Get the full history for a specific record
  static async getEntityHistory(entity: string, entityId: string, actor: AuthUser) {
    if (![UserRole.SUPER_ADMIN, UserRole.ADMIN].includes(actor.role)) {
      throw new ForbiddenError('Audit logs require admin access');
    }
    return prisma.auditLog.findMany({
      where: { entity, entityId, organizationId: actor.organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { id: true, email: true } },
      },
    });
  }
}
```

---

## Frontend — Audit log timeline component

```typescript
// frontend/src/features/audit/AuditTimeline.tsx
import { formatDateTime } from '@/lib/utils';

interface AuditEntry {
  id: string;
  action: string;
  actor: { email: string; profile?: { firstName: string; lastName: string } };
  before?: Record<string, unknown>;
  after?:  Record<string, unknown>;
  createdAt: string;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  ITEM_CREATED:  { label: 'Created',  color: 'var(--positive-color)' },
  ITEM_UPDATED:  { label: 'Updated',  color: 'var(--primary-color)' },
  ITEM_DELETED:  { label: 'Deleted',  color: 'var(--negative-color)' },
  ITEM_APPROVED:    { label: 'Approved', color: 'var(--positive-color)' },
  ITEM_REJECTED:    { label: 'Rejected', color: 'var(--negative-color)' },
  ROLE_CHANGED:      { label: 'Role changed', color: 'var(--warning-color)' },
};

export function AuditTimeline({ entries }: { entries: AuditEntry[] }) {
  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-[var(--border-color)]" />

      <div className="space-y-6 pl-10">
        {entries.map(entry => {
          const meta = ACTION_LABELS[entry.action] ?? { label: entry.action, color: 'var(--secondary-text-color)' };
          const actorName = entry.actor.profile
            ? `${entry.actor.profile.firstName} ${entry.actor.profile.lastName}`
            : entry.actor.email;

          return (
            <div key={entry.id} className="relative">
              {/* Dot */}
              <div className="absolute -left-6 w-2.5 h-2.5 rounded-full border-2 border-white"
                style={{ backgroundColor: meta.color, top: '6px' }} />

              <div className="floating-card rounded-[var(--border-radius-medium)] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="badge" style={{ backgroundColor: `${meta.color}22`, color: meta.color }}>
                      {meta.label}
                    </span>
                    <p className="text-sm text-[var(--secondary-text-color)] mt-1">
                      by <span className="font-medium text-[var(--primary-text-color)]">{actorName}</span>
                    </p>
                  </div>
                  <span className="text-xs text-[var(--text-tertiary)] whitespace-nowrap">{formatDateTime(entry.createdAt)}</span>
                </div>

                {/* Diff view for updates */}
                {entry.before && entry.after && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="bg-[rgba(216,58,82,0.06)] rounded p-2">
                      <p className="text-xs font-medium text-[var(--negative-color)] mb-1">Before</p>
                      <pre className="text-xs text-[var(--primary-text-color)] whitespace-pre-wrap">{JSON.stringify(entry.before, null, 2)}</pre>
                    </div>
                    <div className="bg-[rgba(0,133,77,0.06)] rounded p-2">
                      <p className="text-xs font-medium text-[var(--positive-color)] mb-1">After</p>
                      <pre className="text-xs text-[var(--primary-text-color)] whitespace-pre-wrap">{JSON.stringify(entry.after, null, 2)}</pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

---

## Sanitize before logging — never log sensitive fields

```typescript
// backend/src/utils/auditLogger.ts — sanitize before storing
const SENSITIVE_FIELDS = ['password', 'passwordHash', 'secretEncrypted'];

function sanitize(obj: object | undefined): object | undefined {
  if (!obj) return obj;
  const clone = { ...obj } as Record<string, unknown>;
  for (const key of SENSITIVE_FIELDS) {
    if (key in clone) clone[key] = '[REDACTED]';
  }
  return clone;
}

// In log():
await tx.auditLog.create({
  data: {
    ...params,
    before: sanitize(params.before),
    after:  sanitize(params.after),
  },
});
```

---

## Checklist

- [ ] `auditLogger.log()` called inside every `$transaction` on create/update/delete
- [ ] `before` snapshot captured BEFORE the update query, `after` captured FROM the update result
- [ ] Sensitive encrypted fields are sanitized to `[REDACTED]` before storing in `before`/`after`
- [ ] `AuditLog` has `@@index([organizationId, createdAt])` for fast paginated listing
- [ ] Audit list endpoint restricted to ADMIN and SUPER_ADMIN only
- [ ] Entity history endpoint (by entity + entityId) available for drill-down
- [ ] Action names defined as an enum in `shared/src/enums.ts`
- [ ] Timeline component shows before/after diff for UPDATE actions
- [ ] Audit log export to PDF/Excel available (use skill-report-export-patterns)
