-- P1 Security Foundations — add RBAC-scope columns to the audit trail.
-- Additive + backfill-safe: both columns are nullable, so existing rows get NULL
-- and no data migration is required. Mirrors prisma/schema.prisma AuditLog.
--
-- ⚠ NOT YET APPLIED. Hand-authored (no `prisma migrate` was run against any DB).
-- Held for explicit approval per the P1 gate. Apply with:
--   npx prisma migrate deploy    (prod)   /   npx prisma migrate dev   (local)

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN "site_id" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "zone_id" TEXT;

-- CreateIndex
CREATE INDEX "audit_logs_site_id_idx" ON "audit_logs"("site_id");
CREATE INDEX "audit_logs_zone_id_idx" ON "audit_logs"("zone_id");
