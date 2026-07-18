# /migrate — Safe Database Migration Workflow

Guides you through creating, reviewing, and applying a Prisma migration safely following `rule-database-migrations.md`.

---

## Usage

```
/migrate <description>
```

Examples:
- `/migrate add maintenance task table`
- `/migrate add maintenanceMode column to camera`
- `/migrate rename rtspPassword to rtspPasswordEncrypted`
- `/migrate add index on incident organizationId`

---

## Steps this runs

### 1. Pre-flight check
- Confirm Docker Postgres is running (`docker compose -f docker/docker-compose.dev.yml ps`)
- Confirm no other agent holds a lock on `prisma/schema.prisma` (check `memory/coordination/locks.md`)
- Confirm the DATABASE_URL in `.env` points to the correct database (dev, not prod)

### 2. Schema change
- Show the exact change to make to `prisma/schema.prisma`
- Verify it follows all rules (`rule-database.md`):
  - ✅ `id String @id @default(uuid())`
  - ✅ `organizationId String` present on every org-scoped model (tenant isolation floor — `Organization → Site → Zone → Camera`)
  - ✅ `createdAt DateTime @default(now())`
  - ✅ `updatedAt DateTime @updatedAt`
  - ✅ `deletedAt DateTime?` (soft delete, never hard delete)
  - ✅ `@@index([organizationId, ...])` for common filter combos — plus the hot paths: `cameraId` on `HealthCheck`, `status` on `Incident`, `siteId`/`zoneId` on `Camera`
  - ✅ New enums added to BOTH `schema.prisma` AND `shared/src/enums.ts` (target: `packages/shared/src/enums.ts`) — e.g. `CameraStatus`, `IncidentStatus`, `ClipStatus`, `TaskStatus`, `NotificationStatus`
  - ✅ Sensitive field names end in `Encrypted` (e.g. `rtspPasswordEncrypted`, `apiKeyEncrypted`, `simPinEncrypted`)
  - ✅ `onDelete: Restrict` for User references; `onDelete: Cascade` only for owned children that make no sense orphaned (e.g. `Escalation` under `Incident`)

### 3. Danger check
Flag and ask for confirmation before continuing if the change is:
- **Column drop** — data loss
- **Table drop** — data loss
- **Column type change** — may require a data migration script (e.g. `Camera.healthScore` int → float, `Incident.incidentNumber` format)
- **Adding NOT NULL without a default** — will fail on existing rows
- **Removing a unique constraint** — may allow duplicates (e.g. the unique index on `Camera.cameraCode` or `Incident.incidentNumber`)
- **Renaming a column** — Prisma treats this as drop + add (data loss)

### 4. Create the migration
```bash
pnpm db:migrate -- --name <description>
# This runs: npx prisma migrate dev --name <description>
```

### 5. Generate Prisma client
```bash
pnpm db:generate
# This runs: npx prisma generate
```

### 6. Verify
- Open Prisma Studio: `pnpm db:studio`
- Confirm the new table/column appears
- Run `pnpm typecheck` — verify no TypeScript errors from schema change (backend + frontend workspaces)

### 7. Update seed if needed
- If you added a new required model, add seed data to `prisma/seed.ts` — keep the Region → Zone → Site → Camera hierarchy and the default SUPER_ADMIN user intact

### 8. Write migration notes to memory
- Append to `memory/changes/YYYY-MM-DD-changes.md`
- If this is a breaking change (e.g. touches `HealthCheck` or `AuditLog`, the highest-write-volume tables), write an ADR to `memory/decisions/`

---

## Production deploy sequence (NEVER reverse this order)
```
1. Run migration:  DATABASE_URL=$PROD_URL npx prisma migrate deploy
2. Deploy new code: bring up the new `apps/api` / `apps/workers` images — `docker compose -f docker-compose.fullstack.yml up -d` (GitHub Actions or manual SSH)
```
**NEVER deploy new code before the migration runs.** New code may depend on new columns
(e.g. a new `HealthCheck.diagnosis` code, a new `Incident.recoveryVerifiedAt` column) — the
old code must keep working while the migration runs; use nullable columns, then backfill,
then add `NOT NULL` in a follow-up migration.

Before any production migration: take a full DB backup, and test it on a staging clone
with a realistic volume of `HealthCheck` and `AuditLog` rows.

---

## Rules that apply
- `.claude/rules/rule-database-migrations.md` — production safety rules
- `.claude/rules/rule-database.md` — schema conventions (canon: `docs/05-backend-schema.md`)
