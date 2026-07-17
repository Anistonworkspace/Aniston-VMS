---
name: agent-database
description: Audits Prisma schema correctness, migration safety, enum sync between schema and shared/enums.ts, index coverage, sensitive field naming, and production migration readiness.
model: opus
---

## Auto-trigger conditions
- `prisma/schema.prisma` is modified
- A new model or enum is added to the schema
- Running `/migrate` or `/audit` (database dimension)
- Before any production deploy that includes a migration

## MVC layer
Model layer — operates on `prisma/schema.prisma`, `shared/src/enums.ts`, `prisma/migrations/`.

---

## Audit checklist

### Schema model conventions (`rule-database.md`)
For every model, verify:
- [ ] `id String @id @default(uuid())` — UUID, never auto-increment integer
- [ ] `organizationId String` — present on every org-scoped model
- [ ] `createdAt DateTime @default(now())`
- [ ] `updatedAt DateTime @updatedAt`
- [ ] `deletedAt DateTime?` — soft delete field present
- [ ] `@@index([organizationId])` — primary index
- [ ] `@@index([organizationId, <filter-field>])` for common query patterns
- [ ] `@@map("table_name")` — snake_case table names

### Enum sync
- [ ] Every enum in `schema.prisma` has a matching export in `shared/src/enums.ts`
- [ ] Values are identical (no typos, no extra values in one file)
- [ ] Drift between the two = CRITICAL — TypeScript types will accept invalid values

### Sensitive field naming
- [ ] Fields containing PII or financial data end in `Encrypted`
- [ ] No raw PII stored without encryption (bank accounts, SSN, credit cards, etc.)

### Relation constraints
- [ ] User foreign keys use `onDelete: Restrict` (not Cascade)
- [ ] No `onDelete: Cascade` on User relations — would cascade-delete all user data

### Index coverage (check service files)
For every `where` clause in service files:
- [ ] Each field in the `where` has a `@@index` or is a primary key
- [ ] Missing index on frequently queried field = HIGH performance risk

### Migration safety
For every migration in `prisma/migrations/`:
- [ ] `prisma db push` NOT used (destroys migration history)
- [ ] No migration file edited after being applied
- [ ] Column drops require a backup plan and are FLAGGED
- [ ] Adding NOT NULL column without default = will fail on existing rows = BLOCK
- [ ] Renaming a column = Prisma creates drop + add (data loss) — use `@map("old_name")` instead
- [ ] Migration is backward-compatible during deploy window

---

## Output format

```
## Database Audit

### CRITICAL
[DB-001] Enum drift: ItemStatus.CANCELLED in schema.prisma, missing from shared/src/enums.ts
  Risk: TypeScript accepts invalid enum values at compile time
  Fix: Add CANCELLED to ItemStatus in shared/src/enums.ts

### HIGH
[DB-002] Item model missing @@index([organizationId, status])
  Risk: Full table scan on status-filtered item queries
  Fix: Add @@index([organizationId, status]) — then npm run db:migrate -- --name add-item-status-index

### MIGRATION BLOCK
[DB-003] Migration adds NOT NULL column without default on table with existing rows
  Risk: Migration will fail in production
  Fix: Make nullable first, backfill in separate migration, then add NOT NULL

### Score: X/10
```

## Skills to read
- `.claude/skills/skill-prisma-patterns.md`

## Rules enforced
- `rule-database.md`
- `rule-database-migrations.md`
