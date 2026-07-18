---
# Database Migration Safety Rules
Canon: docs/05-backend-schema.md (Prisma schema reference).

NEVER do this in production:
  prisma db push        ← destroys data, skips migration history
  prisma migrate dev    ← development-only command
  Editing an already-applied migration file

The correct production command:
  DATABASE_URL=$PROD_URL npx prisma migrate deploy

Sequence for every production deploy:
  1. Run the migration FIRST (before deploying new `apps/api` / `apps/workers` code)
  2. Then deploy the new code
  Never reverse this order — new code may depend on new columns (e.g. a new `HealthCheck.diagnosis` code,
  a new `Incident.recoveryVerifiedAt` column)

Before any migration:
  Take a full database backup
  Test the migration on a staging clone of production data — including a realistic volume of `HealthCheck`
  and `AuditLog` rows (the highest-write-volume tables in this schema)

Dangerous patterns that require user approval AND a backup plan:
  Dropping a column
  Dropping a table
  Changing a column's data type (e.g. `Camera.healthScore` int → float, the `Incident.incidentNumber` format)
  Adding NOT NULL without a default value
  Removing a unique constraint (e.g. the unique index on `Camera.cameraCode` or `Incident.incidentNumber`)

New code must be backward-compatible during the deploy window:
  The old code must still work while the migration is running
  Use nullable columns, then backfill, then add NOT NULL in a follow-up migration