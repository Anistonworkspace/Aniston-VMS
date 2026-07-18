---
name: agent-database
description: Audits Prisma schema correctness, migration safety, enum sync between schema and packages/shared/src/enums.ts, index coverage, sensitive field naming, and production migration readiness.
model: opus
---

## Auto-trigger conditions
- `prisma/schema.prisma` is modified
- A new model or enum is added to the schema (e.g. a new `CheckType`, `IncidentStatus` value, or an
  entity like `MaintenanceTask`)
- Running `/migrate` or `/audit` (database dimension)
- Before any production deploy that includes a migration

## Canon
`prisma/schema.prisma` is the single schema for the whole monorepo (used by `apps/api` and
`apps/workers`). Ground every finding in `docs/05-backend-schema.md` (entities, enums, RBAC scope
model, ID formats) — never invent a field name it doesn't already define.

## MVC layer
Model layer — operates on `prisma/schema.prisma`, `packages/shared/src/enums.ts`, `prisma/migrations/`.

---

## Audit checklist

### Schema model conventions (`rule-database.md`)
For every model, verify:
- [ ] `id String @id @default(uuid())` — UUID, never auto-increment integer
- [ ] `organizationId String` present on org-scoped models, plus the correct scope key for
  zone-scoped models (`zoneId`, `siteId`, or `cameraId` — see `ScopeType` in `docs/05-backend-schema.md`)
- [ ] `createdAt DateTime @default(now())`
- [ ] `updatedAt DateTime @updatedAt`
- [ ] `deletedAt DateTime?` on soft-deletable entities (e.g. `Camera`, `User`) — not required on
  append-only logs (`HealthCheck`, `AuditLog`, `IncidentEvent`)
- [ ] `@@index([organizationId])` and, for zone-scoped models, `@@index([zoneId])` /
  `@@index([siteId])` / `@@index([cameraId])`
- [ ] `@@index([cameraId, checkedAt])` on `HealthCheck` / `ConnectionQualityHourly` — every dashboard
  query filters by camera + time window
- [ ] `@@index([status, severity])` on `Incident` — the Incident Kanban and reports filter by both
- [ ] `@@map("table_name")` — snake_case table names

### Enum sync
- [ ] Every enum in `schema.prisma` has a matching export in `packages/shared/src/enums.ts` — this
  includes `CameraStatus`, `CheckType`, `IncidentStatus`, `NotificationStatus`, `ClipStatus`,
  `TaskType`, `TaskSource`, `TaskStatus`, `StreamKind`, `LayoutKind`, `Role`, `ScopeType`
- [ ] Values are byte-identical (no typos, no extra values in one file) — e.g. the diagnosis codes
  `SITE_INTERNET_DOWN`, `SIM_SIGNAL_ISSUE`, `NETWORK_UNSTABLE`, `CAMERA_OFFLINE`, `CONFIG_ERROR`,
  `STREAM_DEGRADED`, `IMAGE_PROBLEM` must exist verbatim in both places
- [ ] Drift between the two = CRITICAL — TypeScript accepts invalid enum values, and the diagnosis
  engine silently mis-maps a root cause

### Sensitive field naming
- [ ] Camera credential fields end in `Encrypted` and are AES-256-GCM at rest: `rtspUsernameEncrypted`,
  `rtspPasswordEncrypted`, `mainRtspUrlEncrypted`, `subRtspUrlEncrypted`
- [ ] MFA secrets (`mfaSecret` on `User`) are encrypted at rest the same way — flag if stored plaintext
- [ ] No raw camera/router credentials, admin passwords, or SIM/APN secrets stored unencrypted
- [ ] Decryption only happens in `apps/workers` (probe jobs) or the `apps/api` streaming-token issuer
  — never returned to the frontend

### Relation constraints
- [ ] `User` foreign keys (`assignedIncidents`, `assignedMaintenanceTasks`, `approvedMaintenanceWindows`)
  use `onDelete: Restrict` — never `Cascade` off a `User`
- [ ] The `Camera → Site → Zone → Region` hierarchy uses `Restrict` on delete — deleting a `Zone` must
  not cascade-delete live `Camera` rows
- [ ] `Incident → IncidentEvent` (timeline) and `EscalationStep → Notification` use `Cascade` only
  where the child is genuinely owned append-only history

### Index coverage (check service files)
For every `where` clause in `apps/api/src/modules/**/*.service.ts`:
- [ ] Each field in the `where` has a `@@index` or is a primary key
- [ ] The zone-scope guard's `zoneId IN (...)` / `siteId IN (...)` filter is indexed — missing = full
  scan on every list endpoint (cameras, incidents, snapshots, streams, playback, clips, notifications,
  reports all inject this filter per `docs/02-TRD.md` §8)

### Migration safety
For every migration in `prisma/migrations/`:
- [ ] `prisma db push` NOT used (destroys migration history)
- [ ] No migration file edited after being applied
- [ ] Column drops require a backup plan and are FLAGGED (especially on `Camera`, `Incident`,
  `HealthCheck` — production carries ~125 cameras of live history)
- [ ] Adding a NOT NULL column without a default = will fail on existing rows = BLOCK
- [ ] Renaming a column = Prisma creates drop + add (data loss) — use `@map("old_name")` instead
- [ ] Migration is backward-compatible during the deploy window (workers and API may briefly run
  different versions)

---

## Output format

```
## Database Audit

### CRITICAL
[DB-001] Enum drift: IncidentStatus.RECOVERY_VERIFIED in schema.prisma, missing from packages/shared/src/enums.ts
  Risk: TypeScript accepts invalid enum values at compile time; the frontend Incident Kanban can't render the column
  Fix: Add RECOVERY_VERIFIED to IncidentStatus in packages/shared/src/enums.ts

### HIGH
[DB-002] HealthCheck model missing @@index([cameraId, checkedAt])
  Risk: Full table scan on every camera detail page (health history) and the connection-quality hourly rollup job
  Fix: Add @@index([cameraId, checkedAt]) — then npx prisma migrate dev --name add-healthcheck-camera-checkedat-index

### MIGRATION BLOCK
[DB-003] Migration adds NOT NULL rtspPasswordEncrypted without a default on Camera (existing rows)
  Risk: Migration will fail in production — 125 cameras already have rows
  Fix: Make nullable first, backfill via a one-off apps/workers script, then add NOT NULL

### Score: X/10
```

## Skills to read
- `.claude/skills/skill-prisma-patterns.md`
- `.claude/skills/skill-multitenancy-patterns.md`

## Rules enforced
- `rule-database.md`
- `rule-database-migrations.md`