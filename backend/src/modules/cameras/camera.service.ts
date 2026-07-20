import crypto from 'node:crypto';
import type { Request } from 'express';
import type { Camera, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { audit } from '../../lib/audit.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../middleware/errorHandler.js';
import { canAccessCamera, canAccessSite, cameraScopeWhere, getUserScope } from '../../lib/scope.js';
import type { AuthUser } from '../../middleware/auth.js';
import { encrypt } from '../../utils/encryption.js';
import { storage, signStorageUrl } from '../../lib/storage.js';
import type { PaginationInput } from '@aniston-vms/shared';
import type {
  CameraListQuery,
  CreateCameraInput,
  CreateReferenceImageInput,
  TestCameraConnectionInput,
  UpdateCameraInput,
} from './camera.schemas.js';
import { env } from '../../config/env.js';
import {
  ffprobeStream,
  getSimFault,
  rtspDescribe,
  simulateStages,
  type CheckResult,
} from '../health/health.checkers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Cameras — leaf of the Region → Zone → Site → Router → Camera hierarchy
// (lib/scope.ts already exposes canAccessCamera(), so — matching Site's
// convention in hierarchy.service.ts — we surface ForbiddenError on
// out-of-scope access rather than NotFoundError).
//
// RTSP credentials (mainRtspUrl/subRtspUrl/rtspUsername/rtspPassword) are
// encrypted at rest with AES-256-GCM (lib/utils/encryption.ts) and are never
// returned to callers or written to the audit trail — see sanitizeCamera().
// mainRtspHash/subRtspHash are a normalized (host+port+path) SHA-256 digest
// used only to enforce the schema's @unique constraint (dedupe the same
// physical stream being registered twice); Prisma's P2002 on those columns
// surfaces as a 409 CONFLICT via the existing errorHandler, so no manual
// pre-check is needed here (mirrors cameraCode's uniqueness handling).
// ─────────────────────────────────────────────────────────────────────────────

function paginate(page: number, limit: number) {
  return { skip: (page - 1) * limit, take: limit };
}

function normalizeRtspUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    const port = u.port || '554';
    const path = u.pathname || '/';
    return `${host}:${port}${path}`;
  } catch {
    // Not a parseable URL (e.g. missing scheme) — fall back to a stable
    // normalization so the hash is still deterministic.
    return raw.trim().toLowerCase();
  }
}

function hashRtspUrl(raw: string): string {
  return crypto.createHash('sha256').update(normalizeRtspUrl(raw)).digest('hex');
}

/** Strips encrypted credential blobs and dedupe hashes before a Camera row
 * is returned to a caller or written to the audit trail. */
function sanitizeCamera(camera: Camera) {
  const {
    mainRtspUrlEncrypted: _mainRtspUrlEncrypted,
    subRtspUrlEncrypted: _subRtspUrlEncrypted,
    rtspUsernameEncrypted: _rtspUsernameEncrypted,
    rtspPasswordEncrypted: _rtspPasswordEncrypted,
    mainRtspHash: _mainRtspHash,
    subRtspHash: _subRtspHash,
    ...rest
  } = camera;
  return rest;
}

export async function listCameras(actor: AuthUser, filters: CameraListQuery) {
  const scope = await getUserScope(actor.id);
  const { page, limit, siteId, routerId, status, q } = filters;
  const where: Prisma.CameraWhereInput = {
    AND: [
      cameraScopeWhere(scope),
      siteId ? { siteId } : {},
      routerId ? { routerId } : {},
      status ? { status } : {},
      q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { cameraCode: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {},
    ],
  };
  const [items, total] = await Promise.all([
    prisma.camera.findMany({
      where,
      orderBy: { name: 'asc' },
      ...paginate(page, limit),
    }),
    prisma.camera.count({ where }),
  ]);
  return { items: items.map(sanitizeCamera), total, page, limit };
}

async function findCameraOrThrow(id: string, actor: AuthUser): Promise<Camera> {
  const camera = await prisma.camera.findUnique({ where: { id } });
  if (!camera) throw new NotFoundError('Camera not found');
  const scope = await getUserScope(actor.id);
  if (!(await canAccessCamera(scope, camera.id)))
    throw new ForbiddenError('Camera outside your access scope');
  return camera;
}

export async function getCameraById(id: string, actor: AuthUser) {
  return sanitizeCamera(await findCameraOrThrow(id, actor));
}

/** Confirms routerId actually belongs to siteId — a camera's router and site
 * must agree, otherwise health/incident scope resolution (both keyed off
 * camera.siteId) would silently disagree with the router it is wired to. */
async function assertRouterBelongsToSite(routerId: string, siteId: string): Promise<void> {
  const router = await prisma.router.findUnique({
    where: { id: routerId },
    select: { siteId: true },
  });
  if (!router) throw new NotFoundError('Router not found');
  if (router.siteId !== siteId)
    throw new ValidationError('Router does not belong to the given site');
}

export async function createCamera(input: CreateCameraInput, actor: AuthUser, req: Request) {
  const scope = await getUserScope(actor.id);
  if (!(await canAccessSite(scope, input.siteId)))
    throw new ForbiddenError('Site outside your access scope');
  await assertRouterBelongsToSite(input.routerId, input.siteId);

  const camera = await prisma.camera.create({
    data: {
      siteId: input.siteId,
      routerId: input.routerId,
      cameraCode: input.cameraCode,
      name: input.name,
      brand: input.brand,
      model: input.model,
      firmware: input.firmware,
      serialNumber: input.serialNumber,
      mainRtspUrlEncrypted: encrypt(input.mainRtspUrl),
      subRtspUrlEncrypted: encrypt(input.subRtspUrl),
      mainRtspHash: hashRtspUrl(input.mainRtspUrl),
      subRtspHash: hashRtspUrl(input.subRtspUrl),
      rtspUsernameEncrypted: encrypt(input.rtspUsername),
      rtspPasswordEncrypted: encrypt(input.rtspPassword),
      onvifPort: input.onvifPort,
      playbackAdapter: input.playbackAdapter ?? 'NONE',
      expectedCodec: input.expectedCodec,
      expectedResolution: input.expectedResolution,
      expectedFps: input.expectedFps,
      expectedBitrateKbps: input.expectedBitrateKbps,
      // CR-6 — map position comes straight from the add-camera modal.
      latitude: input.latitude,
      longitude: input.longitude,
      status: input.status ?? 'UNKNOWN',
    },
  });
  const safe = sanitizeCamera(camera);
  await audit(req, {
    userId: actor.id,
    action: 'camera.create',
    entityType: 'Camera',
    entityId: camera.id,
    newValue: safe,
  });
  return safe;
}

// CR-6 — "Test connection" for the add-camera modal: RTSP DESCRIBE + a single
// ffprobe frame against the candidate URL, before anything is persisted.
// Sim-aware: under HEALTH_SIM_MODE the stages are synthesized from the
// injected sim fault (mirroring health.scheduler.ts), so the modal behaves
// sensibly against the simulated 125-camera fleet.
export interface TestConnectionResult {
  success: boolean;
  simMode: boolean;
  describe: CheckResult;
  video: CheckResult;
}

export async function testCameraConnection(
  input: TestCameraConnectionInput
): Promise<TestConnectionResult> {
  if (env.HEALTH_SIM_MODE) {
    const fault = await getSimFault(input.cameraCode ?? '');
    const sim = simulateStages(fault, {
      codec: input.expectedCodec ?? 'H.264',
      resolution: input.expectedResolution ?? '1920x1080',
      fps: input.expectedFps ?? 15,
      bitrateKbps: input.expectedBitrateKbps ?? 2048,
    });
    return {
      success: sim.rtspAuth.success && sim.video.success,
      simMode: true,
      describe: sim.rtspAuth,
      video: sim.video,
    };
  }

  const describe = await rtspDescribe(input.mainRtspUrl, input.rtspUsername, input.rtspPassword);
  if (!describe.success) {
    return {
      success: false,
      simMode: false,
      describe,
      video: {
        success: false,
        responseTimeMs: 0,
        errorCode: 'SKIPPED',
        errorMessage: 'Skipped — DESCRIBE failed',
      },
    };
  }
  const video = await ffprobeStream(input.mainRtspUrl);
  return { success: video.success, simMode: false, describe, video };
}

export async function updateCamera(
  id: string,
  input: UpdateCameraInput,
  actor: AuthUser,
  req: Request
) {
  const before = await findCameraOrThrow(id, actor);
  const scope = await getUserScope(actor.id);

  const nextSiteId = input.siteId ?? before.siteId;
  const nextRouterId = input.routerId ?? before.routerId;
  if (input.siteId !== undefined && input.siteId !== before.siteId) {
    if (!(await canAccessSite(scope, input.siteId)))
      throw new ForbiddenError('Site outside your access scope');
  }
  if (input.siteId !== undefined || input.routerId !== undefined) {
    await assertRouterBelongsToSite(nextRouterId, nextSiteId);
  }

  const data: Prisma.CameraUncheckedUpdateInput = {
    siteId: input.siteId,
    routerId: input.routerId,
    cameraCode: input.cameraCode,
    name: input.name,
    brand: input.brand,
    model: input.model,
    firmware: input.firmware,
    serialNumber: input.serialNumber,
    onvifPort: input.onvifPort,
    playbackAdapter: input.playbackAdapter,
    expectedCodec: input.expectedCodec,
    expectedResolution: input.expectedResolution,
    expectedFps: input.expectedFps,
    expectedBitrateKbps: input.expectedBitrateKbps,
    status: input.status,
    maintenanceMode: input.maintenanceMode,
    // CR-4 — per-camera snapshot cadence (1–60 min, validated in camera.schemas).
    snapshotIntervalMinutes: input.snapshotIntervalMinutes,
  };
  if (input.mainRtspUrl !== undefined) {
    data.mainRtspUrlEncrypted = encrypt(input.mainRtspUrl);
    data.mainRtspHash = hashRtspUrl(input.mainRtspUrl);
  }
  if (input.subRtspUrl !== undefined) {
    data.subRtspUrlEncrypted = encrypt(input.subRtspUrl);
    data.subRtspHash = hashRtspUrl(input.subRtspUrl);
  }
  if (input.rtspUsername !== undefined) data.rtspUsernameEncrypted = encrypt(input.rtspUsername);
  if (input.rtspPassword !== undefined) data.rtspPasswordEncrypted = encrypt(input.rtspPassword);

  const camera = await prisma.camera.update({ where: { id }, data });
  const safe = sanitizeCamera(camera);
  await audit(req, {
    userId: actor.id,
    action: 'camera.update',
    entityType: 'Camera',
    entityId: id,
    oldValue: sanitizeCamera(before),
    newValue: safe,
  });
  return safe;
}

export async function deleteCamera(id: string, actor: AuthUser, req: Request) {
  const before = await findCameraOrThrow(id, actor);
  const [incidentCount, referenceImageCount] = await Promise.all([
    prisma.incident.count({ where: { cameraId: id } }),
    prisma.referenceImage.count({ where: { cameraId: id } }),
  ]);
  if (incidentCount > 0)
    throw new ConflictError('Cannot delete a camera that still has recorded incidents');
  if (referenceImageCount > 0) {
    throw new ConflictError('Cannot delete a camera that still has approved reference images');
  }
  await prisma.camera.delete({ where: { id } });
  await audit(req, {
    userId: actor.id,
    action: 'camera.delete',
    entityType: 'Camera',
    entityId: id,
    oldValue: sanitizeCamera(before),
  });
}

// ── Reference images ─────────────────────────────────────────────────────────
// Approved installation-reference photos for a camera, stored as opaque blobs
// via lib/storage.ts (never touched directly) and served back only as a
// short-lived signStorageUrl() download link, matching modules/clips and
// modules/reports' existing pattern.

export async function listReferenceImages(
  cameraId: string,
  actor: AuthUser,
  filters: PaginationInput
) {
  await findCameraOrThrow(cameraId, actor);
  const { page, limit } = filters;
  const where: Prisma.ReferenceImageWhereInput = { cameraId };
  const [items, total] = await Promise.all([
    prisma.referenceImage.findMany({
      where,
      orderBy: { approvedAt: 'desc' },
      ...paginate(page, limit),
    }),
    prisma.referenceImage.count({ where }),
  ]);
  return {
    items: items.map((image) => ({ ...image, downloadUrl: signStorageUrl(image.s3Key) })),
    total,
    page,
    limit,
  };
}

export async function approveReferenceImage(
  cameraId: string,
  input: CreateReferenceImageInput,
  actor: AuthUser,
  req: Request
) {
  await findCameraOrThrow(cameraId, actor);
  const buffer = Buffer.from(input.imageBase64, 'base64');
  if (buffer.length === 0) throw new ValidationError('Empty image payload');

  const contentType = input.contentType ?? 'image/jpeg';
  const ext = contentType === 'image/png' ? 'png' : 'jpg';
  const key = `reference-images/${cameraId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  await storage.put(key, buffer, contentType);

  const image = await prisma.referenceImage.create({
    data: { cameraId, s3Key: key, approvedById: actor.id, approvedAt: new Date() },
  });
  await audit(req, {
    userId: actor.id,
    action: 'camera.reference_image.approve',
    entityType: 'ReferenceImage',
    entityId: image.id,
    newValue: { cameraId, s3Key: key },
  });
  return { ...image, downloadUrl: signStorageUrl(key) };
}

export async function deleteReferenceImage(
  cameraId: string,
  imageId: string,
  actor: AuthUser,
  req: Request
) {
  await findCameraOrThrow(cameraId, actor);
  const image = await prisma.referenceImage.findFirst({ where: { id: imageId, cameraId } });
  if (!image) throw new NotFoundError('Reference image not found');

  await prisma.referenceImage.delete({ where: { id: imageId } });
  if (await storage.exists(image.s3Key)) await storage.delete(image.s3Key);
  await audit(req, {
    userId: actor.id,
    action: 'camera.reference_image.delete',
    entityType: 'ReferenceImage',
    entityId: imageId,
    oldValue: { cameraId, s3Key: image.s3Key },
  });
}
