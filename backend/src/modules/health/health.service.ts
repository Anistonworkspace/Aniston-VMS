import { NotFoundError, ForbiddenError, ValidationError } from '../../middleware/errorHandler.js';
import { prisma } from '../../lib/prisma.js';
import {
  canAccessCamera,
  cameraScopeWhere,
  getUserScope,
  zoneScopeWhere,
} from '../../lib/scope.js';
import { DIAGNOSIS_TEXT } from './health.diagnosis.js';
import { runCameraCheck, type ConfiguredCameraWithRouter } from './health.scheduler.js';

// ─────────────────────────────────────────────────────────────────────────────
// Read-side of the Stage 2 health engine: camera health detail, check history,
// hourly quality series, zone rollups — all filtered by the caller's access
// scope (lib/scope.ts). Manual "run now" reuses the scheduler pipeline.
// ─────────────────────────────────────────────────────────────────────────────

async function assertCameraAccess(userId: string, cameraId: string): Promise<void> {
  const scope = await getUserScope(userId);
  if (!(await canAccessCamera(scope, cameraId))) {
    throw new ForbiddenError('Camera outside your access scope');
  }
}

export async function getCameraHealth(userId: string, cameraId: string): Promise<unknown> {
  await assertCameraAccess(userId, cameraId);
  const camera = await prisma.camera.findUnique({
    where: { id: cameraId },
    select: {
      id: true,
      cameraCode: true,
      name: true,
      latitude: true,
      longitude: true,
      status: true,
      healthScore: true,
      diagnosis: true,
      lastHealthyAt: true,
      maintenanceMode: true,
      expectedCodec: true,
      expectedResolution: true,
      expectedFps: true,
      expectedBitrateKbps: true,
      site: { select: { id: true, name: true } },
      router: {
        select: { id: true, connectionStatus: true, signalStrength: true, operator: true },
      },
    },
  });
  if (!camera) throw new NotFoundError('Camera not found');

  // Latest result per check type (the DiagnosisBanner pipeline view)
  const latestChecks = await prisma.healthCheck.findMany({
    where: { cameraId },
    orderBy: { startedAt: 'desc' },
    take: 4 * 5, // last few runs; dedupe below
  });
  const latestByType: Record<string, (typeof latestChecks)[number]> = {};
  for (const c of latestChecks) {
    latestByType[c.checkType] ??= c;
  }

  return {
    ...camera,
    diagnosisText: camera.diagnosis ? DIAGNOSIS_TEXT[camera.diagnosis] : null,
    pipeline: ['ROUTER_TCP', 'RTSP_PORT', 'RTSP_AUTH', 'VIDEO_VALIDATION'].map((t) => {
      const c = latestByType[t];
      return c
        ? {
            checkType: t,
            success: c.success,
            responseTimeMs: c.responseTimeMs,
            errorCode: c.errorCode,
            errorMessage: c.errorMessage,
            codec: c.codec,
            resolution: c.resolution,
            fps: c.fps,
            bitrateKbps: c.bitrateKbps,
            startedAt: c.startedAt,
          }
        : { checkType: t, success: null };
    }),
  };
}

export async function getCameraChecks(
  userId: string,
  cameraId: string,
  hours: number,
  checkType?: string
): Promise<unknown[]> {
  await assertCameraAccess(userId, cameraId);
  return prisma.healthCheck.findMany({
    where: {
      cameraId,
      startedAt: { gt: new Date(Date.now() - hours * 3600_000) },
      ...(checkType ? { checkType: checkType as never } : {}),
    },
    orderBy: { startedAt: 'desc' },
    take: 500,
  });
}

export async function getCameraQuality(
  userId: string,
  cameraId: string,
  hours: number
): Promise<unknown[]> {
  await assertCameraAccess(userId, cameraId);
  return prisma.connectionQualityHourly.findMany({
    where: { cameraId, hour: { gt: new Date(Date.now() - hours * 3600_000) } },
    orderBy: { hour: 'asc' },
  });
}

export async function runCameraCheckNow(userId: string, cameraId: string): Promise<unknown> {
  await assertCameraAccess(userId, cameraId);
  const camera = await prisma.camera.findUnique({
    where: { id: cameraId },
    include: { router: true },
  });
  if (!camera) throw new NotFoundError('Camera not found');
  // Only CONFIGURED cameras have the stream config + router relation needed to
  // probe. DRAFT cameras are registered by identity only and cannot be checked.
  if (camera.provisioningState !== 'CONFIGURED' || !camera.router) {
    throw new ValidationError('Cannot run a health check on a DRAFT camera; configure it first.');
  }
  // Cast is sound: the CONFIGURED guard above guarantees the stream config columns
  // and router relation are non-null (mirrors the scheduler's own query invariant).
  const result = await runCameraCheck(camera as ConfiguredCameraWithRouter);
  return {
    ...result,
    diagnosisText: result.diagnosis ? DIAGNOSIS_TEXT[result.diagnosis as never] : null,
  };
}

/** Per-zone health rollup for the caller's scope (zone cards / NOC board). */
export async function getZoneRollups(userId: string): Promise<unknown[]> {
  const scope = await getUserScope(userId);
  const zones = await prisma.zone.findMany({
    where: zoneScopeWhere(scope),
    select: {
      id: true,
      name: true,
      region: { select: { id: true, name: true } },
      sites: {
        select: {
          id: true,
          cameras: { select: { status: true, healthScore: true, diagnosis: true } },
        },
      },
    },
    orderBy: { name: 'asc' },
  });
  return zones.map((z) => {
    const cams = z.sites.flatMap((s) => s.cameras);
    const count = (st: string): number => cams.filter((c) => c.status === st).length;
    const avg = cams.length
      ? Math.round(cams.reduce((a, c) => a + c.healthScore, 0) / cams.length)
      : 0;
    return {
      zoneId: z.id,
      zoneName: z.name,
      region: z.region,
      siteCount: z.sites.length,
      cameraCount: cams.length,
      healthy: count('HEALTHY'),
      warning: count('WARNING'),
      critical: count('CRITICAL'),
      maintenance: count('MAINTENANCE'),
      unknown: count('UNKNOWN'),
      avgHealthScore: avg,
    };
  });
}

/** Flat scoped camera list with health fields (dashboard tables). */
export async function getCameraHealthList(userId: string): Promise<unknown[]> {
  const scope = await getUserScope(userId);
  return prisma.camera.findMany({
    where: cameraScopeWhere(scope),
    select: {
      id: true,
      cameraCode: true,
      name: true,
      status: true,
      healthScore: true,
      diagnosis: true,
      lastHealthyAt: true,
      site: { select: { id: true, name: true, zone: { select: { id: true, name: true } } } },
    },
    orderBy: [{ status: 'asc' }, { healthScore: 'asc' }],
  });
}
