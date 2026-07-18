# Skill — Audit Log Patterns (credential, stream & incident access)

---

Write, query, and display audit logs for compliance. Every credential-decrypt, stream-session start,
incident action, and privileged CRUD must be logged. When a mutation and its audit entry both touch the
DB, they go in the **same Prisma transaction** — an audit trail that can silently fail to write is not a
trail.

## AuditLog model (already in `docs/05-backend-schema.md`)

```prisma
model AuditLog {
  id             String      @id @default(uuid())
  organizationId String
  actorId        String?     // null for system/BullMQ-job-initiated entries
  action         AuditAction
  entityType     String      // 'Camera' | 'Router' | 'Incident' | 'User' | 'OrgSettings' | ...
  entityId       String?
  metadata       Json?       // redacted diff / context — never raw credentials
  ipAddress      String?
  userAgent      String?
  createdAt      DateTime    @default(now())

  @@index([organizationId, entityType, entityId])
  @@index([organizationId, createdAt])
}

enum AuditAction {
  CAMERA_CREATED
  CAMERA_UPDATED
  CAMERA_DELETED
  CAMERA_RESTORED
  CAMERA_CREDENTIALS_VIEWED
  ROUTER_CREDENTIALS_VIEWED
  ROUTER_REBOOT_TRIGGERED
  STREAM_SESSION_STARTED
  CLIP_EXPORTED
  INCIDENT_CREATED
  INCIDENT_ACKNOWLEDGED
  INCIDENT_RESOLVED
  INCIDENT_ESCALATED
  ROLE_CHANGED
  ORG_SETTINGS_UPDATED
  PASSWORD_CHANGED
  PLATFORM_CROSS_ORG_READ
}
```

## Redacting sensitive fields before they ever reach `metadata`

```typescript
// apps/api/src/common/utils/audit-logger.ts
const SENSITIVE_FIELDS = [
  'passwordHash', 'rtspPasswordEncrypted', 'onvifPasswordEncrypted',
  'adminPasswordEncrypted', 'simPinEncrypted', 'refreshToken',
];

function sanitizeForAudit(entity: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(entity).map(([k, v]) => [k, SENSITIVE_FIELDS.includes(k) ? '[REDACTED]' : v]),
  );
}
```

## Logging pattern — audit entry created in the same transaction as the mutation

```typescript
// apps/api/src/modules/cameras/cameras.service.ts
async update(actor: AuthUser, id: string, dto: UpdateCameraDto) {
  return this.prisma.$transaction(async (tx) => {
    const before = await tx.camera.findFirstOrThrow({ where: { id, organizationId: actor.organizationId } });
    const after = await tx.camera.update({ where: { id }, data: dto });
    await this.auditLogger.log(tx, {
      action: 'CAMERA_UPDATED',
      organizationId: actor.organizationId,
      actorId: actor.id,
      entityType: 'Camera',
      entityId: id,
      metadata: { before: sanitizeForAudit(before), after: sanitizeForAudit(after) },
    });
    return after;
  });
}
```

## Credential views and stream sessions are always logged (no silent reads)

```typescript
async getDecryptedCredentials(actor: AuthUser, id: string) {
  const camera = await this.prisma.camera.findFirstOrThrow({ where: { id, organizationId: actor.organizationId } });
  await this.auditLogger.log({
    action: 'CAMERA_CREDENTIALS_VIEWED',
    organizationId: actor.organizationId,
    actorId: actor.id,
    entityType: 'Camera',
    entityId: id,
    ipAddress: actor.ip,
  });
  return { rtspPassword: safeDecrypt(camera.rtspPasswordEncrypted) };
}
```

## Querying entity history

```typescript
async getEntityHistory(organizationId: string, entityType: string, entityId: string) {
  return this.prisma.auditLog.findMany({
    where: { organizationId, entityType, entityId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}
```

## Frontend — timeline components (incident escalation, camera history)

```typescript
// frontend/src/features/audit/AuditTimeline.tsx
const ACTION_LABELS: Record<AuditAction, string> = {
  CAMERA_CREDENTIALS_VIEWED: 'Credentials viewed',
  INCIDENT_ACKNOWLEDGED: 'Incident acknowledged',
  INCIDENT_ESCALATED: 'Incident escalated',
  ROUTER_REBOOT_TRIGGERED: 'Router reboot triggered',
  // ... one label per AuditAction, kept in shared/src/enums.ts alongside the enum itself
};

function AuditTimeline({ entries }: { entries: AuditEntry[] }) {
  return (
    <ol>
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-3 border-l-2 pl-3">
          <span className="text-tertiary">{formatDateTime(entry.createdAt)}</span>
          <span className="font-medium">{ACTION_LABELS[entry.action] ?? entry.action}</span>
          <span className="text-secondary">{entry.actorName ?? 'System'}</span>
        </li>
      ))}
    </ol>
  );
}
```

`EscalationTimeline` (incident detail page) and camera/router "credential access" history panels both
reuse this same `AuditTimeline` component, filtered by `entityType`/`entityId`.

## Rules

1. Every credential decrypt, stream-session start, incident state change, role change, and org-settings
   update writes an `AuditLog` row — grep any new mutation for a matching `auditLogger.log(...)` call
   before merging.
2. Mutation + audit write happen in the same `$transaction` wherever the mutation is itself transactional;
   an audit entry must never be the thing that's missing after a partial failure.
3. `metadata` is always passed through `sanitizeForAudit()` — `SENSITIVE_FIELDS` (password hashes, any
   `*Encrypted` column, refresh tokens) are redacted, never stored in the clear in the audit trail.
4. Audit log rows are scoped by `organizationId` like every other tenant model, and `SUPER_ADMIN` cross-org
   reads (`PLATFORM_CROSS_ORG_READ`) get their own dedicated action so they're distinguishable in review.
5. Audit history is append-only — no `update`/`delete` on `AuditLog` rows, ever.