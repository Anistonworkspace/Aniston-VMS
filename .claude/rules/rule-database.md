---
# Database Rules — Prisma / PostgreSQL
Canon: docs/05-backend-schema.md.

Every Prisma model MUST have these fields:
  id             String   @id @default(uuid())
  organizationId String                          ← tenant isolation floor (see rule-security-rbac.md for the zone-scope ceiling on top of this)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  deletedAt      DateTime?    ← soft delete, never hard delete

Entity hierarchy (informs relations and indexes):
  Organization → Site → Zone → Camera
  Site → Router → Sim
  Camera → HealthCheck (1:many), Camera → Incident (1:many), Incident → Escalation (1:many)
  Camera → Snapshot / Recording, Camera/Site/Zone → MaintenanceTask
  Every actor-driven mutation → AuditLog

Naming conventions:
  IDs: always UUID, never auto-increment integer
  Enums: define in BOTH `prisma/schema.prisma` AND `packages/shared/src/enums.ts` — keep them in sync
  (`ScopeType`, `CameraStatus`, `IncidentStatus`, `ClipStatus`, `LayoutKind`, `StreamKind`, `TaskSource`,
  `TaskStatus`, `TaskType`, `CheckType`, `NotificationStatus`)
  Sensitive fields: suffix with `Encrypted` (e.g. `rtspPasswordEncrypted`, `apiKeyEncrypted`, `simPinEncrypted`)
  Relations: use `onDelete: Restrict` for User references (prevent accidental cascade); use `onDelete: Cascade`
  only for owned child records that make no sense orphaned (e.g. `Escalation` under `Incident`)

Indexes:
  Always add `@@index` on `organizationId`
  Add `@@index` on every field used in WHERE clauses in services — for this schema that especially means
  `cameraId` on `HealthCheck`, `status` on `Incident`, and `siteId`/`zoneId` on `Camera`
  `HealthCheck` and `AuditLog` are high-volume, append-mostly tables — index the time column
  (`checkedAt`, `createdAt`) for range queries and dashboard aggregation

Production safety (see also rule-database-migrations.md):
  NEVER run `prisma db push` in production
  NEVER edit an already-applied migration file
  Always take a DB backup before any migration