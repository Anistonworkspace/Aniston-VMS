import { Router } from 'express';
import type { z } from 'zod';
import { authUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validation.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { audit } from '../../lib/audit.js';
import {
  backupListQuerySchema,
  createBackupSchema,
  updateSystemSettingsSchema,
  upsertStoragePolicySchema,
} from './settings.schemas.js';
import * as settingsService from './settings.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// CR-10 Settings admin API (mounted at /api, SUPER_ADMIN + PROJECT_ADMIN only):
//   GET  /settings/system           — whitelisted key/value system settings
//   PUT  /settings/system           — patch one or more settings (audited)
//   GET  /settings/storage-policies — ZONE/SITE clip & snapshot toggles
//   PUT  /settings/storage-policies — upsert one policy (audited)
//   GET  /settings/capacity         — caps + active live sessions + storage estimate
//   GET  /settings/backups          — recent snapshot backups (+signed download URLs)
//   POST /settings/backups          — build a snapshot ZIP for a scope/range (audited)
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_ROLES = ['SUPER_ADMIN', 'PROJECT_ADMIN'] as const;

export const settingsRouter = Router();

settingsRouter.use(requireAuth);
settingsRouter.use(requireRole(...ADMIN_ROLES));

settingsRouter.get(
  '/settings/system',
  asyncHandler(async (_req, res) => {
    const data = await settingsService.getSystemSettings();
    res.json({ success: true, data });
  })
);

settingsRouter.put(
  '/settings/system',
  validateRequest({ body: updateSystemSettingsSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof updateSystemSettingsSchema>;
    const { old, settings } = await settingsService.updateSystemSettings(body);
    await audit(req, {
      userId: authUser(req).id,
      action: 'settings.system.update',
      entityType: 'SystemSetting',
      entityId: 'system',
      oldValue: old,
      newValue: settings,
    });
    res.json({ success: true, data: settings });
  })
);

settingsRouter.get(
  '/settings/storage-policies',
  asyncHandler(async (_req, res) => {
    const data = await settingsService.listStoragePolicies();
    res.json({ success: true, data });
  })
);

settingsRouter.put(
  '/settings/storage-policies',
  validateRequest({ body: upsertStoragePolicySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof upsertStoragePolicySchema>;
    const data = await settingsService.upsertStoragePolicy(body);
    await audit(req, {
      userId: authUser(req).id,
      action: 'settings.storage_policy.upsert',
      entityType: 'StoragePolicy',
      entityId: data.id,
      newValue: {
        scopeType: body.scopeType,
        scopeId: body.scopeId,
        storeClips: body.storeClips,
        storeSnapshots: body.storeSnapshots,
      },
    });
    res.json({ success: true, data });
  })
);

settingsRouter.get(
  '/settings/capacity',
  asyncHandler(async (_req, res) => {
    const data = await settingsService.getCapacityOverview();
    res.json({ success: true, data });
  })
);

settingsRouter.get(
  '/settings/backups',
  validateRequest({ query: backupListQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof backupListQuerySchema>;
    const data = await settingsService.listBackups(query);
    res.json({ success: true, data });
  })
);

settingsRouter.post(
  '/settings/backups',
  validateRequest({ body: createBackupSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createBackupSchema>;
    const data = await settingsService.createBackup(authUser(req), body);
    await audit(req, {
      userId: authUser(req).id,
      action: 'backup.create',
      entityType: 'Backup',
      entityId: data.id,
      newValue: {
        scopeType: body.scopeType,
        scopeId: body.scopeId,
        rangeStart: body.rangeStart.toISOString(),
        rangeEnd: body.rangeEnd.toISOString(),
        status: data.status,
      },
    });
    res.status(201).json({ success: true, data });
  })
);
