import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// CR-10 Settings & capacity admin API schemas.
//
// System settings are a small whitelisted key/value set (system_settings
// table, Json values, seeded in prisma/seed.ts). Storage policies are
// ZONE/SITE-scoped toggles; backups are snapshot ZIP exports over a bounded
// date range. All shapes here are admin-only (router enforces roles).
// ─────────────────────────────────────────────────────────────────────────────

export const updateSystemSettingsSchema = z
  .object({
    retention_days: z.coerce.number().int().min(1).max(3650),
    compression_quality: z.coerce.number().int().min(10).max(100),
    max_live_sessions_global: z.coerce.number().int().min(1).max(10_000),
    max_live_sessions_per_site: z.coerce.number().int().min(1).max(1_000),
  })
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, {
    message: 'Provide at least one setting to update',
  });

export type UpdateSystemSettingsInput = z.infer<typeof updateSystemSettingsSchema>;

// StoragePolicy.scopeType is ZONE | SITE only (app-enforced; see schema.prisma).
export const upsertStoragePolicySchema = z
  .object({
    scopeType: z.enum(['ZONE', 'SITE']),
    scopeId: z.string().uuid(),
    storeClips: z.boolean(),
    storeSnapshots: z.boolean(),
  })
  .strict();

export type UpsertStoragePolicyInput = z.infer<typeof upsertStoragePolicySchema>;

// Backups are built synchronously in-request (local storage driver), so the
// range is capped to keep the ZIP bounded.
export const MAX_BACKUP_RANGE_DAYS = 31;

export const createBackupSchema = z
  .object({
    scopeType: z.enum(['ZONE', 'SITE']),
    scopeId: z.string().uuid(),
    rangeStart: z.coerce.date(),
    rangeEnd: z.coerce.date(),
  })
  .strict()
  .refine((o) => o.rangeEnd.getTime() > o.rangeStart.getTime(), {
    message: 'rangeEnd must be after rangeStart',
  })
  .refine(
    (o) => o.rangeEnd.getTime() - o.rangeStart.getTime() <= MAX_BACKUP_RANGE_DAYS * 86_400_000,
    { message: `Backup range may not exceed ${MAX_BACKUP_RANGE_DAYS} days` }
  );

export type CreateBackupInput = z.infer<typeof createBackupSchema>;

export const backupListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type BackupListQuery = z.infer<typeof backupListQuerySchema>;
