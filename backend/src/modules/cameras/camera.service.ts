import crypto from 'node:crypto';
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import type { Camera } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { audit, auditWithinTx } from '../../lib/audit.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../middleware/errorHandler.js';
import { canAccessCamera, canAccessSite, cameraScopeWhere, getUserScope } from '../../lib/scope.js';
import type { AuthUser } from '../../middleware/auth.js';
import { encrypt, decrypt } from '../../utils/encryption.js';
import { storage, signStorageUrl } from '../../lib/storage.js';
import type { PaginationInput } from '@aniston-vms/shared';
import { CameraProvisioning, CameraStatus } from '@aniston-vms/shared';
import { assertTransition } from './camera.provisioning.js';
import type {
  CameraListQuery,
  RegisterCameraInput,
  ConfigureCameraInput,
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
import { injectRtspCredentials } from '../../lib/rtsp-url.js';

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

// Dedup-identity key for the @unique mainRtspHash/subRtspHash columns.
// DISTINCT from lib/rtsp-url's canonical sanitizer (which already ran at the
// schema trust boundary and preserves the full vendor path/query byte-for-byte).
// This deliberately reduces a URL to host:port/path — dropping credentials and
// query — so the SAME physical stream registered twice dedupes. Do NOT fold
// this into the canonical normalizer: they are different operations by design.
function rtspDedupKey(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    const port = u.port || '554';
    const path = u.pathname || '/';
    return `${host}:${port}${path}`;
  } catch {
    // Not a parseable URL (e.g. missing scheme) — fall back to a stable
    // normalization so the hash is still deterministic. (In practice the input
    // is already canonical: rtspUrlSchema validated it at the API boundary.)
    return raw.trim().toLowerCase();
  }
}

function hashRtspUrl(raw: string): string {
  return crypto.createHash('sha256').update(rtspDedupKey(raw)).digest('hex');
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
  const { page, limit, siteId, zoneId, routerId, status, q } = filters;
  const where: Prisma.CameraWhereInput = {
    AND: [
      cameraScopeWhere(scope),
      siteId ? { siteId } : {},
      // Zone filter rides the site relation; ANDed with cameraScopeWhere so it
      // only ever narrows the caller's visible fleet (never widens RBAC).
      zoneId ? { site: { zoneId } } : {},
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

/** Placement + stream config columns that must all be present before a camera
 * can leave DRAFT. configureCameraSchema guarantees they are written together,
 * so this guard really only fails the register-but-never-configured case. */
function assertConfigured(camera: Camera): void {
  const incomplete =
    camera.siteId == null ||
    camera.routerId == null ||
    camera.mainRtspUrlEncrypted == null ||
    camera.subRtspUrlEncrypted == null ||
    camera.rtspUsernameEncrypted == null ||
    camera.rtspPasswordEncrypted == null ||
    camera.expectedCodec == null ||
    camera.expectedResolution == null ||
    camera.expectedFps == null ||
    camera.expectedBitrateKbps == null ||
    camera.latitude == null ||
    camera.longitude == null;
  if (incomplete)
    throw new ValidationError(
      'Configure the camera (site, network, and stream details) before activating it'
    );
}

/**
 * Step 1 of the split workflow: add a physical camera to the inventory with
 * IDENTITY ONLY. There is no site yet, so there is no site scope to check here
 * (write RBAC is enforced at the router via CAMERA_WRITE_ROLES). The row is born
 * DRAFT (schema default) + UNKNOWN health — invisible to the health scheduler
 * and playback until it is configured and activated.
 */
export async function registerCamera(input: RegisterCameraInput, actor: AuthUser, req: Request) {
  const camera = await prisma.camera.create({
    data: {
      cameraCode: input.cameraCode,
      name: input.name,
      brand: input.brand,
      model: input.model,
      firmware: input.firmware,
      serialNumber: input.serialNumber,
      // provisioningState defaults to DRAFT and status to UNKNOWN; placement +
      // stream config stay NULL until configureCamera fills them in.
    },
  });
  const safe = sanitizeCamera(camera);
  await audit(req, {
    userId: actor.id,
    action: 'camera.register',
    entityType: 'Camera',
    entityId: camera.id,
    newValue: safe,
  });
  return safe;
}

/**
 * Step 2: place the camera into a site/zone and save its network + stream
 * config. The caller must be able to reach the TARGET site and the router must
 * live in that site (same invariant the old createCamera enforced). Saving
 * config does NOT change provisioningState — activation is a separate,
 * connection-test-gated step, so a DRAFT camera stays DRAFT and a CONFIGURED
 * camera being edited stays CONFIGURED.
 */
export async function configureCamera(
  id: string,
  input: ConfigureCameraInput,
  actor: AuthUser,
  req: Request
) {
  const before = await findCameraOrThrow(id, actor);
  const scope = await getUserScope(actor.id);
  if (!(await canAccessSite(scope, input.siteId)))
    throw new ForbiddenError('Site outside your access scope');
  await assertRouterBelongsToSite(input.routerId, input.siteId);

  const camera = await prisma.camera.update({
    where: { id },
    data: {
      siteId: input.siteId,
      routerId: input.routerId,
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
      latitude: input.latitude,
      longitude: input.longitude,
    },
  });
  const safe = sanitizeCamera(camera);
  await audit(req, {
    userId: actor.id,
    action: 'camera.configure',
    entityType: 'Camera',
    entityId: id,
    siteId: input.siteId,
    oldValue: sanitizeCamera(before),
    newValue: safe,
  });
  return safe;
}

export interface ActivateCameraResult {
  camera: ReturnType<typeof sanitizeCamera>;
  activated: boolean;
  test: TestConnectionResult;
}

/**
 * Step 3: DRAFT → CONFIGURED. The server is the authoritative gate — it RE-RUNS
 * the connection test against the STORED config (never trusting a client that
 * asserts "it passed"), and only flips the state when that test succeeds. A
 * failing test is an expected outcome, not an error: the camera stays DRAFT and
 * the per-stage result is returned so the UI can show WHY it failed.
 */
export async function activateCamera(
  id: string,
  actor: AuthUser,
  req: Request
): Promise<ActivateCameraResult> {
  const before = await findCameraOrThrow(id, actor);
  // Reject re-activation up front (409) — cheaper than probing first.
  // `provisioningState` arrives as Prisma's generated string-union enum; the
  // domain state machine speaks the shared nominal enum. They share an
  // identical string domain (schema enum ⇄ shared/src/enums.ts), so this
  // Prisma→domain boundary cast is sound.
  assertTransition(before.provisioningState as CameraProvisioning, CameraProvisioning.CONFIGURED);
  assertConfigured(before);

  const test = await testCameraConnection({
    mainRtspUrl: decrypt(before.mainRtspUrlEncrypted!),
    rtspUsername: decrypt(before.rtspUsernameEncrypted!),
    rtspPassword: decrypt(before.rtspPasswordEncrypted!),
    cameraCode: before.cameraCode,
    expectedCodec: before.expectedCodec ?? undefined,
    expectedResolution: before.expectedResolution ?? undefined,
    expectedFps: before.expectedFps ?? undefined,
    expectedBitrateKbps: before.expectedBitrateKbps ?? undefined,
  });

  if (!test.success) {
    return { camera: sanitizeCamera(before), activated: false, test };
  }

  const camera = await prisma.camera.update({
    where: { id },
    data: {
      provisioningState: CameraProvisioning.CONFIGURED,
      // Seed the initial health state honestly from the advisory video probe so the
      // operator sees the truth the moment the camera goes CONFIGURED, instead of a
      // misleading green: activation gates on reachability + auth (DESCRIBE), so a
      // camera whose live frame could not be validated activates as WARNING, not
      // HEALTHY. The health scheduler owns this field (with hysteresis) from its next
      // tick — this is only the seed until then.
      status: test.video.success ? CameraStatus.HEALTHY : CameraStatus.WARNING,
    },
  });
  const safe = sanitizeCamera(camera);
  await audit(req, {
    userId: actor.id,
    action: 'camera.activate',
    entityType: 'Camera',
    entityId: id,
    siteId: before.siteId,
    oldValue: sanitizeCamera(before),
    newValue: safe,
  });
  return { camera: safe, activated: true, test };
}

/**
 * Reverse of activate: CONFIGURED → DRAFT. Config is RETAINED (so the camera can
 * be re-activated without re-entering everything), but health resets to UNKNOWN
 * since the scheduler will stop probing it while it is DRAFT.
 */
export async function deactivateCamera(id: string, actor: AuthUser, req: Request) {
  const before = await findCameraOrThrow(id, actor);
  // assertTransition 409s a camera that is already DRAFT.
  // Prisma→domain enum boundary cast (identical string domain) — see activateCamera.
  assertTransition(before.provisioningState as CameraProvisioning, CameraProvisioning.DRAFT);

  const camera = await prisma.camera.update({
    where: { id },
    data: {
      provisioningState: CameraProvisioning.DRAFT,
      status: 'UNKNOWN',
      diagnosis: null,
    },
  });
  const safe = sanitizeCamera(camera);
  await audit(req, {
    userId: actor.id,
    action: 'camera.deactivate',
    entityType: 'Camera',
    entityId: id,
    siteId: before.siteId,
    oldValue: sanitizeCamera(before),
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
    // Resilient provisioning: `success` (which gates activation) reflects
    // reachability + authentication (the DESCRIBE/rtspAuth stage), NOT the live-video
    // stage. The video probe is advisory — a camera can be correctly wired and
    // authenticated yet momentarily fail a single-frame read (transport quirk, keyframe
    // interval, transient bitrate), and blocking activation on that stranded operators
    // with a green DESCRIBE and a red "Probe failed". Continuous health monitoring
    // owns the live-video verdict from here on.
    return {
      success: sim.rtspAuth.success,
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
  // ffprobe (unlike rtspDescribe) has no separate credential params — it can only
  // authenticate with creds embedded in the URL userinfo. Inject them so a camera
  // that requires RTSP Digest auth (DESCRIBE above proved it does) doesn't 401 →
  // `ffprobe exit 1`. Mirrors resolveCameraSource() used by live-wall/streaming.
  const probeUrl = injectRtspCredentials(input.mainRtspUrl, input.rtspUsername, input.rtspPassword);
  const video = await ffprobeStream(probeUrl);
  // Resilient provisioning: gate on DESCRIBE (reachability + auth), which already
  // passed to reach here. The live-video probe is advisory — its result is returned so
  // callers/UI can surface it, but a video-only failure must not block activation of a
  // demonstrably reachable + authenticated camera. Continuous health monitoring owns
  // the live-video verdict from activation onward.
  return { success: describe.success, simMode: false, describe, video };
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
  // Only validate the router↔site relationship when both are known post-edit.
  // A DRAFT camera may be partially placed (site or router still null); the
  // configure gate enforces both-required before it can leave DRAFT, so there
  // is nothing to cross-check here yet.
  if (
    (input.siteId !== undefined || input.routerId !== undefined) &&
    nextSiteId != null &&
    nextRouterId != null
  ) {
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
  const before = await findCameraOrThrow(id, actor); // 404 out-of-scope-missing / 403 forbidden

  // Removing a camera is ALWAYS allowed — any and every camera can be deleted.
  // Every table that references a camera (incidents, health_checks, snapshots,
  // connection_quality_hourly, sd_card_status, recording_segments,
  // reference_images, maintenance_tasks, maintenance_windows, stream_sessions,
  // clip_exports) has an ON DELETE SET NULL foreign key, so historical rows are
  // preserved with their camera_id nulled instead of blocking the delete. There is
  // no "retained history" 409 path any more.
  //
  // Delete + audit as one atomic unit: auditWithinTx writes inside the same
  // transaction, so we never lose the audit trail for a delete (the old
  // best-effort audit(req, …) swallowed failures). If the audit write fails, the
  // whole transaction rolls back rather than leaving a camera removed with no
  // audit record; the error propagates to the global handler unchanged.
  await prisma.$transaction(async (tx) => {
    await tx.camera.delete({ where: { id } });

    await auditWithinTx(tx, {
      userId: actor.id,
      action: 'camera.delete',
      entityType: 'Camera',
      entityId: id,
      siteId: before.siteId, // Camera has a direct site_id column; enables site-scoped audit filtering. No zoneId column (zone lives above site), so it defaults null.
      oldValue: sanitizeCamera(before), // strips all 6 encrypted/hash fields — no creds in the audit row
      ipAddress: req.ip ?? null,
    });
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
