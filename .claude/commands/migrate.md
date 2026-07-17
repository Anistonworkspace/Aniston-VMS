# /migrate — Safe Database Migration Workflow

Guides you through creating, reviewing, and applying a Prisma migration safely following `rule-database-migrations.md`.

---

## Usage

```
/migrate <description>
```

Examples:
- `/migrate add item table`
- `/migrate add status column to item`
- `/migrate rename secret to secretEncrypted`
- `/migrate add index on category organizationId`

---

## Steps this runs

### 1. Pre-flight check
- Confirm Docker Postgres is running (`docker compose ps`)
- Confirm no other agent holds a lock on `prisma/schema.prisma` (check `memory/coordination/locks.md`)
- Confirm the DATABASE_URL in `.env` points to the correct database (dev, not prod)

### 2. Schema change
- Show the exact change to make to `prisma/schema.prisma`
- Verify it follows all rules:
  - ✅ `id String @id @default(uuid())`
  - ✅ `organizationId String` present on every org-scoped model
  - ✅ `createdAt DateTime @default(now())`
  - ✅ `updatedAt DateTime @updatedAt`
  - ✅ `deletedAt DateTime?` (soft delete)
  - ✅ `@@index([organizationId, ...])` for common filter combos
  - ✅ New enums added to BOTH `schema.prisma` AND `shared/src/enums.ts`
  - ✅ Sensitive field names end in `Encrypted`

### 3. Danger check
Flag and ask for confirmation before continuing if the change is:
- **Column drop** — data loss
- **Table drop** — data loss
- **Column type change** — may require data migration script
- **Adding NOT NULL without a default** — will fail on existing rows
- **Removing a unique constraint** — may allow duplicates
- **Renaming a column** — Prisma treats this as drop + add (data loss)

### 4. Create the migration
```bash
npm run db:migrate -- --name <description>
# This runs: npx prisma migrate dev --name <description>
```

### 5. Generate Prisma client
```bash
npm run db:generate
# This runs: npx prisma generate
```

### 6. Verify
- Open Prisma Studio: `npm run db:studio`
- Confirm the new table/column appears
- Run `npm run typecheck` — verify no TypeScript errors from schema change

### 7. Update seed if needed
- If you added a new required model, add seed data to `prisma/seed.ts`

### 8. Write migration notes to memory
- Append to `memory/changes/YYYY-MM-DD-changes.md`
- If this is a breaking change, write an ADR to `memory/decisions/`

---

## Production deploy sequence (NEVER reverse this order)
```
1. Run migration:  DATABASE_URL=$PROD npx prisma migrate deploy
2. Deploy new code: PM2 reload / GitHub Actions deploy
```
**NEVER deploy new code before the migration runs.**

---

## Rules that apply
- `.claude/rules/rule-database-migrations.md` — production safety rules
- `.claude/rules/rule-database.md` — schema conventions
