import { createHash } from 'node:crypto';
import type { ClipExport, Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { storage, signStorageUrl } from '../../lib/storage.js';
import { canAccessCamera, cameraScopeWhere, getUserScope } from '../../lib/scope.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../middleware/errorHandler.js';
import type { AuthUser } from '../../middleware/auth.js';
import { enqueueClipExport } from './clip.queue.js';
import type { ClipListQuery, CreateClipInput } from './clip.schemas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Clip export service. A ClipExport row travels QUEUED → PROCESSING →
// DONE|FAILED as clip.worker.ts's BullMQ worker picks it up (see
// runClipExportJob below, invoked by the worker's processor — kept here
// rather than in clip.worker.ts so all camera/DB/storage logic stays in one
// service file per the codebase's 4-layer MVC convention).
//
// There is no real ffmpeg/MediaMTX recording archive reachable in this
// environment, so the "export" is simulated: a small deterministic buffer is
// generated and pushed through the same storage.put() + signStorageUrl()
// path a real render would use, so the full pipeline (queue → storage →
// signed download) is exercised end to end. Swapping in real ffmpeg only
// touches simulateClipBytes()/runClipExportJob() below.
// ─────────────────────────────────────────────────────────────────────────────

async function requireCamera(userId: string, cameraId: string) {
  const scope = await getUserScope(userId);
  if (!(await canAccessCamera(scope, cameraId))) {
    throw new ForbiddenError('Camera not visible under your access scope');
  }
  const camera = await prisma.camera.findUnique({ where: { id: cameraId } });
  if (!camera) throw new NotFoundError('Camera not found');
  return camera;
}

function toPublicClip(clip: ClipExport): {
  id: string;
  cameraId: string | null;
  requestedById: string;
  startAt: Date;
  endAt: Date;
  status: ClipExport['status'];
  sizeBytes: number | null;
  error: string | null;
  incidentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  downloadUrl: string | null;
} {
  return {
    id: clip.id,
    cameraId: clip.cameraId,
    requestedById: clip.requestedById,
    startAt: clip.startAt,
    endAt: clip.endAt,
    status: clip.status,
    // BigInt isn't JSON-serializable — clip sizes stay well under
    // Number.MAX_SAFE_INTEGER, so a plain Number is fine.
    sizeBytes: clip.sizeBytes !== null ? Number(clip.sizeBytes) : null,
    error: clip.error,
    incidentId: clip.incidentId,
    createdAt: clip.createdAt,
    updatedAt: clip.updatedAt,
    downloadUrl:
      clip.status === 'DONE' && clip.s3Key
        ? signStorageUrl(clip.s3Key, {
            filename: `clip-${clip.cameraId ?? 'camera'}-${clip.id}.mp4`,
            contentType: 'video/mp4',
          })
        : null,
  };
}

export async function createClipExport(
  actor: AuthUser,
  cameraId: string,
  input: CreateClipInput
): Promise<ReturnType<typeof toPublicClip>> {
  const camera = await requireCamera(actor.id, cameraId);

  // A DRAFT (unconfigured) camera has no site and has never recorded, so there
  // is no footage to export. Reject before touching storage policies, which are
  // keyed on the camera's site. (This also narrows siteId to non-null below.)
  if (camera.siteId == null) {
    throw new ValidationError('Camera is not configured — no footage is available to export');
  }

  // CR-9 — a SITE- or ZONE-level storage policy with storeClips=false blocks
  // new exports for every camera under that scope, with a clear message.
  // (Cameras hang off sites; the zone is reached through Site.zoneId.)
  const site = await prisma.site.findUnique({
    where: { id: camera.siteId },
    select: { zoneId: true },
  });
  const policies = await prisma.storagePolicy.findMany({
    where: {
      OR: [
        { scopeType: 'SITE', scopeId: camera.siteId },
        ...(site ? [{ scopeType: 'ZONE' as const, scopeId: site.zoneId }] : []),
      ],
    },
    select: { scopeType: true, storeClips: true },
  });
  const blocking = policies.find((p) => !p.storeClips);
  if (blocking) {
    const level = blocking.scopeType === 'SITE' ? 'site' : 'zone';
    throw new ValidationError(
      `Clip storage is disabled for this camera's ${level} by storage policy — new clip exports are blocked here`
    );
  }

  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  const durationMinutes = (endAt.getTime() - startAt.getTime()) / 60_000;
  if (durationMinutes > env.CLIP_EXPORT_MAX_DURATION_MINUTES) {
    throw new ValidationError(
      `Clip duration exceeds the ${env.CLIP_EXPORT_MAX_DURATION_MINUTES}-minute maximum`
    );
  }

  if (input.incidentId) {
    const incident = await prisma.incident.findUnique({
      where: { id: input.incidentId },
      select: { id: true },
    });
    if (!incident) throw new NotFoundError('Incident not found');
  }

  const clip = await prisma.clipExport.create({
    data: {
      cameraId: camera.id,
      requestedById: actor.id,
      startAt,
      endAt,
      status: 'QUEUED',
      incidentId: input.incidentId ?? null,
    },
  });

  await enqueueClipExport(clip.id);
  logger.info('Clip export queued', { clipExportId: clip.id, cameraId: camera.id });

  return toPublicClip(clip);
}

export async function listClipExports(
  actor: AuthUser,
  filters: ClipListQuery
): Promise<Array<ReturnType<typeof toPublicClip>>> {
  const scope = await getUserScope(actor.id);
  // CR-9 — optional site/zone narrowing composed with AND so the user's
  // access scope (which also filters via the `site` relation) is never
  // widened or clobbered. Zone reaches the camera through Site.zoneId.
  const cameraWhere: Prisma.CameraWhereInput = {
    AND: [
      cameraScopeWhere(scope),
      ...(filters.siteId ? [{ siteId: filters.siteId }] : []),
      ...(filters.zoneId ? [{ site: { zoneId: filters.zoneId } }] : []),
    ],
  };
  const where: Prisma.ClipExportWhereInput = {
    camera: cameraWhere,
    ...(filters.cameraId ? { cameraId: filters.cameraId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.incidentId ? { incidentId: filters.incidentId } : {}),
  };
  const clips = await prisma.clipExport.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: filters.limit,
  });
  return clips.map(toPublicClip);
}

export async function getClipExport(
  actor: AuthUser,
  clipExportId: string
): Promise<ReturnType<typeof toPublicClip>> {
  const clip = await prisma.clipExport.findUnique({ where: { id: clipExportId } });
  if (!clip) throw new NotFoundError('Clip export not found');
  const scope = await getUserScope(actor.id);
  if (!(await canAccessCamera(scope, clip.cameraId))) {
    throw new ForbiddenError('Camera not visible under your access scope');
  }
  return toPublicClip(clip);
}

// ── BullMQ processor body (invoked by clip.worker.ts's Worker) ─────────────

export async function runClipExportJob(clipExportId: string): Promise<void> {
  const clip = await prisma.clipExport.findUnique({
    where: { id: clipExportId },
    include: { camera: { select: { cameraCode: true } } },
  });
  if (!clip) {
    logger.warn('Clip export job skipped — row not found', { clipExportId });
    return;
  }

  await prisma.clipExport.update({
    where: { id: clipExportId },
    data: { status: 'PROCESSING', error: null },
  });

  try {
    const durationSeconds = Math.max(
      1,
      Math.round((clip.endAt.getTime() - clip.startAt.getTime()) / 1000)
    );
    // The camera may have been hard-deleted after this job was queued; the clip
    // row keeps its cameraId=null. Fall back to stable seeds so the historical
    // export still succeeds.
    const cameraCode = clip.camera?.cameraCode ?? 'deleted-camera';
    const buffer = simulateClipBytes(cameraCode, clip.id, durationSeconds);
    const key = `clips/${clip.cameraId ?? 'orphaned'}/${clip.id}.mp4`;
    await storage.put(key, buffer, 'video/mp4');
    await prisma.clipExport.update({
      where: { id: clipExportId },
      data: { status: 'DONE', s3Key: key, sizeBytes: BigInt(buffer.length) },
    });
    logger.info('Clip export completed', { clipExportId, sizeBytes: buffer.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.clipExport.update({
      where: { id: clipExportId },
      data: { status: 'FAILED', error: message },
    });
    logger.error('Clip export failed', { clipExportId, error: message });
  }
}

// Deterministic placeholder MP4-shaped buffer, sized roughly to the requested
// duration. Production would shell out to ffmpeg against the camera's
// recorded segments (or a real MediaMTX VOD read) for [startAt, endAt) — no
// such pipeline exists in this environment.
function simulateClipBytes(cameraCode: string, clipId: string, durationSeconds: number): Buffer {
  const seed = createHash('sha256').update(`${cameraCode}:${clipId}:${durationSeconds}`).digest();
  const size = Math.max(4096, Math.min(2_000_000, durationSeconds * 4096));
  const body = Buffer.alloc(size);
  for (let i = 0; i < size; i += 1) body[i] = seed[i % seed.length];
  // A minimal "ftyp" box up front so the bytes at least look like an MP4 container.
  const ftyp = Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
  ]);
  ftyp.copy(body, 0);
  return body;
}

// ── Retention (CLIP_EXPORT_RETENTION_DAYS) — invoked by the repeatable
// 'prune-retention' job scheduled from clip.worker.ts ──────────────────────

export interface PruneClipsResult {
  deletedRows: number;
}

export async function pruneClipExports(now: Date = new Date()): Promise<PruneClipsResult> {
  const cutoff = new Date(now.getTime() - env.CLIP_EXPORT_RETENTION_DAYS * 86_400_000);
  const stale = await prisma.clipExport.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true, s3Key: true },
  });
  for (const clip of stale) {
    if (clip.s3Key && (await storage.exists(clip.s3Key))) {
      await storage.delete(clip.s3Key);
    }
  }
  if (stale.length > 0) {
    await prisma.clipExport.deleteMany({ where: { id: { in: stale.map((c) => c.id) } } });
  }
  const result = { deletedRows: stale.length };
  logger.info('Clip export retention pass complete', { ...result });
  return result;
}
