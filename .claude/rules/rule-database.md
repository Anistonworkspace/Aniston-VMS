---
# Database Rules

Every Prisma model MUST have these fields:
  id          String   @id @default(uuid())
  organizationId String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?    ← soft delete, never hard delete

Naming conventions:
  IDs: always UUID, never auto-increment integer
  Enums: define in BOTH prisma/schema.prisma AND shared/src/enums.ts — keep them in sync
  Sensitive fields: suffix with Encrypted (e.g. bankAccountNumberEncrypted)
  Relations: use onDelete: Restrict for User references (prevent accidental cascade)

Indexes:
  Always add @@index on organizationId
  Add @@index on every field used in WHERE clauses in services

Production safety (see also rule-database-migrations.md):
  NEVER run prisma db push in production
  NEVER edit an already-applied migration file
  Always take a DB backup before any migration
