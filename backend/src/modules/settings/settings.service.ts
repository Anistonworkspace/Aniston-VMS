import JSZip from 'jszip';
import type { Backup, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { signStorageUrl, storage } from '../../lib/storage.js';
import { env } from '../../config/env.js';
import { NotFoundError } from '../../middleware/errorHandler.js';
import type { AuthUser } from '../../middleware/auth.js';
import type {
  BackupListQuery,
  CreateBackupInput,
  UpdateSystemSettingsInput,
  UpsertStoragePolicyInput,
} from './settings.schemas.js';

// ─────────────────────────────────────────────────────────────────────────────
// CR-10 Settings, storage policies, capacity overview & snapshot backups.
//
// System settings live in system_settings (key/Json value, seeded). The
// numeric caps here are also consumed by playback.service.ts to enforce the
// TRD §17 global / per-site concurrent live-stream limits.
// ─────────────────────────────────────────────────────────────────────────────

export const SETTING_DEFAULTS = {
  retention_days: 30,
  compression_quality: 70,
  max_live_sessions_global: 40,
  max_live_sessions_per_site: 6,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[];

function coerceNumber(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Read one numeric setting with its seeded default as fallback. Exported for
 *  playback.service.ts (live-session cap enforcement). */
export async function getNumericSetting(key: SettingKey): Promise<number> {
  const row = await prisma.systemSetting.findFirst({ where: { key }, select: { value: true } });
  return coerceNumber(row?.value, SETTING_DEFAULTS[key]);
}

export async function getSystemSettings(): Promise<Record<SettingKey, number>> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: SETTING_KEYS } },
    select: { key: true, value: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(
    SETTING_KEYS.map((k) => [k, coerceNumber(byKey.get(k), SETTING_DEFAULTS[k])])
  ) as Record<SettingKey, number>;
}

export async function updateSystemSettings(
  patch: UpdateSystemSettingsInput
): Promise<{ old: Record<SettingKey, number>; settings: Record<SettingKey, number> }> {
  const old = await getSystemSettings();
  const entries = Object.entries(patch) as [SettingKey, number][];
  for (const [key, value] of entries) {
    const existing = await prisma.systemSetting.findFirst({ where: { key }, select: { id: true } });
    if (existing) {
      await prisma.systemSetting.update({ where: { id: existing.id }, data: { value } });
    } else {
      await prisma.systemSetting.create({ data: { key, value } });
    }
  }
  const settings = await getSystemSettings();
  return { old, settings };
}

// ── Storage policies (ZONE | SITE scoped clip/snapshot retention toggles) ────

async function resolveScopeName(scopeType: 'ZONE' | 'SITE', scopeId: string): Promise<string> {
  if (scopeType === 'ZONE') {
    const zone = await prisma.zone.findUnique({ where: { id: scopeId }, select: { name: true } });
    if (!zone) throw new NotFoundError('Zone not found');
    return zone.name;
  }
  const site = await prisma.site.findUnique({ where: { id: scopeId }, select: { name: true } });
  if (!site) throw new NotFoundError('Site not found');
  return site.name;
}

export async function listStoragePolicies() {
  const [policies, zones, sites] = await Promise.all([
    prisma.storagePolicy.findMany({ orderBy: [{ scopeType: 'asc' }, { createdAt: 'asc' }] }),
    prisma.zone.findMany({ select: { id: true, name: true } }),
    prisma.site.findMany({ select: { id: true, name: true } }),
  ]);
  const names = new Map<string, string>([
    ...zones.map((z): [string, string] => [`ZONE:${z.id}`, z.name]),
    ...sites.map((s): [string, string] => [`SITE:${s.id}`, s.name]),
  ]);
  return policies.map((p) => ({
    id: p.id,
    scopeType: p.scopeType,
    scopeId: p.scopeId,
    scopeName: names.get(`${p.scopeType}:${p.scopeId}`) ?? 'Unknown',
    storeClips: p.storeClips,
    storeSnapshots: p.storeSnapshots,
    updatedAt: p.updatedAt,
  }));
}

export async function upsertStoragePolicy(input: UpsertStoragePolicyInput) {
  const scopeName = await resolveScopeName(input.scopeType, input.scopeId);
  const existing = await prisma.storagePolicy.findFirst({
    where: { scopeType: input.scopeType, scopeId: input.scopeId },
    select: { id: true },
  });
  const data = {
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    storeClips: input.storeClips,
    storeSnapshots: input.storeSnapshots,
  };
  const policy = existing
    ? await prisma.storagePolicy.update({ where: { id: existing.id }, data })
    : await prisma.storagePolicy.create({ data });
  return { ...policy, scopeName };
}

// ── Capacity overview (caps + live sessions + storage estimate) ──────────────

const LIVE_KINDS = ['LIVE_SUB', 'LIVE_MAIN'] as const;

/** GB/day for one camera at its expected bitrate (SI units). */
function dailyGb(expectedBitrateKbps: number): number {
  return (expectedBitrateKbps * 1000 * 86_400) / (8 * 1_000_000_000);
}

export async function getCapacityOverview() {
  const [settings, sites, cameras, activeLive] = await Promise.all([
    getSystemSettings(),
    prisma.site.findMany({
      select: { id: true, name: true, zone: { select: { name: true } } },
      orderBy: { name: 'asc' },
    }),
    // Capacity planning covers CONFIGURED cameras only: DRAFT cameras have no
    // site and no configured bitrate, so they consume no storage or bandwidth.
    prisma.camera.findMany({
      where: { provisioningState: 'CONFIGURED' },
      select: { siteId: true, expectedBitrateKbps: true },
    }),
    prisma.streamSession.findMany({
      where: { endedAt: null, kind: { in: [...LIVE_KINDS] } },
      select: { camera: { select: { siteId: true } } },
    }),
  ]);

  const liveBySite = new Map<string, number>();
  for (const s of activeLive) {
    // A live session normally implies a streaming (CONFIGURED) camera with a
    // siteId. A camera hard-deleted mid-session leaves the row's camera null —
    // skip it since it can no longer be attributed to a site.
    if (!s.camera?.siteId) continue;
    liveBySite.set(s.camera.siteId, (liveBySite.get(s.camera.siteId) ?? 0) + 1);
  }
  const camsBySite = new Map<string, { count: number; dailyGb: number }>();
  let totalDailyGb = 0;
  for (const c of cameras) {
    // cameras is CONFIGURED-only (queried above), so siteId/bitrate are set.
    const bucket = camsBySite.get(c.siteId!) ?? { count: 0, dailyGb: 0 };
    bucket.count += 1;
    bucket.dailyGb += dailyGb(c.expectedBitrateKbps!);
    camsBySite.set(c.siteId!, bucket);
    totalDailyGb += dailyGb(c.expectedBitrateKbps!);
  }

  return {
    caps: {
      maxLiveSessionsGlobal: settings.max_live_sessions_global,
      maxLiveSessionsPerSite: settings.max_live_sessions_per_site,
      perCameraStreamCap: env.STREAM_MAX_CONCURRENT_PER_CAMERA,
    },
    live: { activeGlobal: activeLive.length },
    storage: {
      retentionDays: settings.retention_days,
      compressionQuality: settings.compression_quality,
      cameraCount: cameras.length,
      estimatedDailyGb: Math.round(totalDailyGb * 10) / 10,
      estimatedRetainedGb: Math.round(totalDailyGb * settings.retention_days * 10) / 10,
    },
    perSite: sites.map((site) => {
      const cams = camsBySite.get(site.id) ?? { count: 0, dailyGb: 0 };
      return {
        siteId: site.id,
        siteName: site.name,
        zoneName: site.zone.name,
        cameraCount: cams.count,
        activeLiveSessions: liveBySite.get(site.id) ?? 0,
        estimatedDailyGb: Math.round(cams.dailyGb * 10) / 10,
      };
    }),
  };
}

// ── Snapshot backups (ZIP of originals + manifest over a date range) ─────────

const MAX_BACKUP_SNAPSHOTS = 2000;

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function toPublicBackup(b: Backup & { requester?: { name: string } | null }) {
  return {
    id: b.id,
    scopeType: b.scopeType,
    scopeId: b.scopeId,
    rangeStart: b.rangeStart,
    rangeEnd: b.rangeEnd,
    status: b.status,
    sizeBytes: b.sizeBytes === null ? null : Number(b.sizeBytes),
    error: b.error,
    requesterName: b.requester?.name ?? null,
    createdAt: b.createdAt,
    downloadUrl: b.status === 'DONE' && b.fileKey ? signStorageUrl(b.fileKey) : null,
  };
}

export async function listBackups(query: BackupListQuery) {
  const backups = await prisma.backup.findMany({
    orderBy: { createdAt: 'desc' },
    take: query.limit,
    include: { requester: { select: { name: true } } },
  });
  return backups.map(toPublicBackup);
}

export async function createBackup(actor: AuthUser, input: CreateBackupInput) {
  const scopeName = await resolveScopeName(input.scopeType, input.scopeId);
  const backup = await prisma.backup.create({
    data: {
      requestedBy: actor.id,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
      status: 'RUNNING',
    },
  });

  try {
    const cameraWhere: Prisma.CameraWhereInput =
      input.scopeType === 'SITE' ? { siteId: input.scopeId } : { site: { zoneId: input.scopeId } };
    const snapshots = await prisma.snapshot.findMany({
      where: { camera: cameraWhere, capturedAt: { gte: input.rangeStart, lte: input.rangeEnd } },
      orderBy: { capturedAt: 'asc' },
      take: MAX_BACKUP_SNAPSHOTS,
      include: { camera: { select: { cameraCode: true, name: true } } },
    });

    const zip = new JSZip();
    const rows: string[] = [
      'snapshot_id,camera_code,camera_name,captured_at,kind,stamped,stamp_text,file_included',
    ];
    let filesIncluded = 0;
    for (const s of snapshots) {
      let included = false;
      try {
        const buf = await storage.get(s.originalKey);
        const stamp = s.capturedAt.toISOString().replace(/:/g, '-');
        zip.file(`snapshots/${s.camera?.cameraCode ?? 'unknown-camera'}/${stamp}_${s.id}.jpg`, buf);
        included = true;
        filesIncluded += 1;
      } catch {
        // Seeded snapshots may reference keys that were never materialised on
        // disk — record them in the manifest but skip the binary.
      }
      rows.push(
        [
          s.id,
          csvCell(s.camera?.cameraCode ?? ''),
          csvCell(s.camera?.name ?? ''),
          s.capturedAt.toISOString(),
          s.kind,
          String(s.stamped),
          csvCell(s.stampText ?? ''),
          String(included),
        ].join(',')
      );
    }
    zip.file('manifest.csv', rows.join('\n'));
    zip.file(
      'backup.json',
      JSON.stringify(
        {
          id: backup.id,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          scopeName,
          rangeStart: input.rangeStart.toISOString(),
          rangeEnd: input.rangeEnd.toISOString(),
          snapshotCount: snapshots.length,
          filesIncluded,
          truncated: snapshots.length === MAX_BACKUP_SNAPSHOTS,
          generatedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    const fileKey = `backups/${backup.id}.zip`;
    await storage.put(fileKey, buffer, 'application/zip');

    const done = await prisma.backup.update({
      where: { id: backup.id },
      data: { status: 'DONE', fileKey, sizeBytes: BigInt(buffer.length) },
      include: { requester: { select: { name: true } } },
    });
    logger.info('Backup built', {
      backupId: backup.id,
      scope: `${input.scopeType}:${scopeName}`,
      snapshots: snapshots.length,
      filesIncluded,
      sizeBytes: buffer.length,
    });
    return toPublicBackup(done);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Backup failed';
    const failed = await prisma.backup
      .update({
        where: { id: backup.id },
        data: { status: 'FAILED', error: message },
        include: { requester: { select: { name: true } } },
      })
      .catch(() => null);
    logger.error('Backup failed', { backupId: backup.id, error: message });
    if (failed) return toPublicBackup(failed);
    throw err;
  }
}
