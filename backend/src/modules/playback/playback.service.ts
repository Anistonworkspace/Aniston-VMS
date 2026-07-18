import { randomUUID } from 'node:crypto';
import type { Prisma, Role, StreamSession } from '@prisma/client';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { canAccessCamera, cameraScopeWhere, getUserScope } from '../../lib/scope.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../middleware/errorHandler.js';
import type { AuthUser } from '../../middleware/auth.js';
import {
  buildMediamtxPath,
  buildStreamEndpoints,
  publishStream,
  teardownStream,
} from './mediamtx.adapter.js';
import type {
  EndSessionInput,
  HeartbeatInput,
  SegmentsQuery,
  SessionListQuery,
  StartSessionInput,
} from './playback.schemas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Playback / live-view session service. A StreamSession row is the source of
// truth for "who is looking at which camera, on which MediaMTX path, since
// when" — the same shape backs LIVE_SUB/LIVE_MAIN viewing and PLAYBACK (VOD
// scrubbing) sessions (see prisma StreamKind). Stale sessions (no heartbeat
// within STREAM_SESSION_TIMEOUT_SECONDS) are swept by playback.reaper.ts.
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_ROLES: readonly Role[] = ['SUPER_ADMIN', 'PROJECT_ADMIN'];

async function requireCamera(userId: string, cameraId: string) {
  const scope = await getUserScope(userId);
  if (!(await canAccessCamera(scope, cameraId))) {
    throw new ForbiddenError('Camera not visible under your access scope');
  }
  const camera = await prisma.camera.findUnique({ where: { id: cameraId } });
  if (!camera) throw new NotFoundError('Camera not found');
  return camera;
}

async function getAccessibleSession(actor: AuthUser, sessionId: string): Promise<StreamSession> {
  const session = await prisma.streamSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new NotFoundError('Stream session not found');
  const scope = await getUserScope(actor.id);
  if (!(await canAccessCamera(scope, session.cameraId))) {
    throw new ForbiddenError('Camera not visible under your access scope');
  }
  if (session.userId !== actor.id && !ADMIN_ROLES.includes(actor.role)) {
    throw new ForbiddenError('Not the owner of this stream session');
  }
  return session;
}

interface PlaybackRange {
  rangeStartAt?: string;
  rangeEndAt?: string;
}

function toPublicSession(session: StreamSession, range?: PlaybackRange) {
  const endpoints = buildStreamEndpoints(session.mediamtxPath);
  const hasRange = range?.rangeStartAt && range.rangeEndAt;
  const urls = hasRange
    ? {
        ...endpoints,
        // Synthetic VOD query params — a real MediaMTX/ffmpeg integration would
        // use these bounds to serve the recorded range instead of the live feed.
        hlsUrl: `${endpoints.hlsUrl}?start=${encodeURIComponent(range.rangeStartAt!)}&end=${encodeURIComponent(range.rangeEndAt!)}`,
        rtspUrl: `${endpoints.rtspUrl}?start=${encodeURIComponent(range.rangeStartAt!)}&end=${encodeURIComponent(range.rangeEndAt!)}`,
      }
    : endpoints;
  return {
    id: session.id,
    cameraId: session.cameraId,
    userId: session.userId,
    kind: session.kind,
    startedAt: session.startedAt,
    lastHeartbeatAt: session.lastHeartbeatAt,
    endedAt: session.endedAt,
    endReason: session.endReason,
    clientIp: session.clientIp,
    // BigInt isn't JSON-serializable — bytesEstimate stays well under
    // Number.MAX_SAFE_INTEGER for any realistic session, so a plain Number is fine.
    bytesEstimate: session.bytesEstimate !== null ? Number(session.bytesEstimate) : null,
    simMode: env.PLAYBACK_SIM_MODE,
    ...urls,
  };
}

export async function startSession(
  actor: AuthUser,
  input: StartSessionInput,
  clientIp: string
): Promise<ReturnType<typeof toPublicSession>> {
  const camera = await requireCamera(actor.id, input.cameraId);

  const activeCount = await prisma.streamSession.count({
    where: { cameraId: camera.id, endedAt: null },
  });
  if (activeCount >= env.STREAM_MAX_CONCURRENT_PER_CAMERA) {
    throw new ConflictError(
      `Camera has reached the maximum of ${env.STREAM_MAX_CONCURRENT_PER_CAMERA} concurrent stream sessions`
    );
  }

  const id = randomUUID();
  const mediamtxPath = buildMediamtxPath(camera.cameraCode, input.kind, id);
  await publishStream(mediamtxPath);

  const now = new Date();
  const session = await prisma.streamSession.create({
    data: {
      id,
      cameraId: camera.id,
      userId: actor.id,
      kind: input.kind,
      mediamtxPath,
      startedAt: now,
      lastHeartbeatAt: now,
      clientIp,
    },
  });

  logger.info('Stream session started', {
    sessionId: session.id,
    cameraId: camera.id,
    kind: input.kind,
    simMode: env.PLAYBACK_SIM_MODE,
  });

  return toPublicSession(session, { rangeStartAt: input.startAt, rangeEndAt: input.endAt });
}

export async function heartbeat(
  actor: AuthUser,
  sessionId: string,
  input: HeartbeatInput
): Promise<ReturnType<typeof toPublicSession>> {
  const session = await getAccessibleSession(actor, sessionId);
  if (session.endedAt) throw new ConflictError('Stream session has already ended');

  const updated = await prisma.streamSession.update({
    where: { id: sessionId },
    data: {
      lastHeartbeatAt: new Date(),
      ...(input.bytesEstimate !== undefined ? { bytesEstimate: BigInt(input.bytesEstimate) } : {}),
    },
  });
  return toPublicSession(updated);
}

export async function endSession(
  actor: AuthUser,
  sessionId: string,
  input: EndSessionInput
): Promise<ReturnType<typeof toPublicSession>> {
  const session = await getAccessibleSession(actor, sessionId);
  if (session.endedAt) return toPublicSession(session); // idempotent

  await teardownStream(session.mediamtxPath);
  const updated = await prisma.streamSession.update({
    where: { id: sessionId },
    data: { endedAt: new Date(), endReason: input.reason ?? 'client_ended' },
  });
  logger.info('Stream session ended', { sessionId, reason: updated.endReason });
  return toPublicSession(updated);
}

export async function getSession(
  actor: AuthUser,
  sessionId: string
): Promise<ReturnType<typeof toPublicSession>> {
  const session = await getAccessibleSession(actor, sessionId);
  return toPublicSession(session);
}

export async function listActiveSessions(
  actor: AuthUser,
  filters: SessionListQuery
): Promise<Array<ReturnType<typeof toPublicSession> & { camera: unknown; user: unknown }>> {
  const scope = await getUserScope(actor.id);
  const where: Prisma.StreamSessionWhereInput = {
    endedAt: null,
    camera: cameraScopeWhere(scope),
    ...(filters.cameraId ? { cameraId: filters.cameraId } : {}),
  };
  const sessions = await prisma.streamSession.findMany({
    where,
    include: {
      camera: { select: { id: true, cameraCode: true, name: true } },
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { startedAt: 'desc' },
  });
  return sessions.map((s) => ({
    ...toPublicSession(s),
    camera: s.camera,
    user: s.user,
  }));
}

export async function listSegments(
  actor: AuthUser,
  cameraId: string,
  query: SegmentsQuery
): Promise<unknown[]> {
  const camera = await requireCamera(actor.id, cameraId);
  const segments = await prisma.recordingSegment.findMany({
    where: {
      cameraId: camera.id,
      startAt: { lt: new Date(query.endAt) },
      endAt: { gt: new Date(query.startAt) },
      ...(query.track ? { track: query.track } : {}),
    },
    orderBy: { startAt: 'asc' },
  });
  return segments;
}
