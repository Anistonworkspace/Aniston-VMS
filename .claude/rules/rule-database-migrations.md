---
# Database Migration Safety Rules

NEVER do this in production:
  prisma db push        ← destroys data, skips migration history
  prisma migrate dev    ← development-only command
  Editing an already-applied migration file

The correct production command:
  DATABASE_URL=$PROD_URL npx prisma migrate deploy

Sequence for every production deploy:
  1. Run the migration FIRST (before deploying new code)
  2. Then deploy the new code
  Never reverse this order — new code may depend on new columns

Before any migration:
  Take a full database backup
  Test the migration on a staging clone of production data

Dangerous patterns that require user approval AND a backup plan:
  Dropping a column
  Dropping a table
  Changing a column's data type
  Adding NOT NULL without a default value
  Removing a unique constraint

New code must be backward-compatible during the deploy window:
  The old code must still work while the migration is running
  Use nullable columns, then backfill, then add NOT NULL in a follow-up migration
