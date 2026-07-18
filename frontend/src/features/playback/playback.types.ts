// Shapes mirror the backend contracts exactly:
// - Sessions:  backend/src/modules/playback/playback.service.ts toPublicSession()
//              (backend/prisma schema.prisma model StreamSession)
// - Segments:  backend/prisma schema.prisma model RecordingSegment, returned
//              as-is by playback.service.ts listSegments()
// - Clips:     backend/src/modules/clips/clip.service.ts toPublicClip()
//              (backend/prisma schema.prisma model ClipExport)
// All Date fields arrive as ISO strings over JSON; BigInt fields (bytesEstimate,
// sizeBytes) are coerced to plain numbers server-side before serialization.

export type StreamKind = 'LIVE_SUB' | 'LIVE_MAIN' | 'PLAYBACK';

export interface StreamEndpoints {
  mediamtxPath: string;
  hlsUrl: string;
  webrtcUrl: string;
  rtspUrl: string;
}

/** POST /streams/start · GET /streams/:id · POST /streams/:id/heartbeat|end response shape. */
export interface StreamSession extends StreamEndpoints {
  id: string;
  cameraId: string;
  userId: string;
  kind: StreamKind;
  startedAt: string;
  lastHeartbeatAt: string;
  endedAt: string | null;
  endReason: string | null;
  clientIp: string;
  bytesEstimate: number | null;
  /** Mirrors env.PLAYBACK_SIM_MODE — true while there's no real MediaMTX/ffmpeg reachable. */
  simMode: boolean;
}

/** GET /streams (OPERATOR+ monitoring list) — includes participant relations. */
export interface StreamSessionWithParticipants extends StreamSession {
  camera: { id: string; cameraCode: string; name: string };
  user: { id: string; name: string; email: string };
}

/** POST /streams/start — backend startSessionBodySchema. startAt/endAt required when kind === 'PLAYBACK'. */
export interface StartSessionInput {
  cameraId: string;
  kind: StreamKind;
  startAt?: string;
  endAt?: string;
}

/** POST /streams/:id/heartbeat — backend heartbeatBodySchema. */
export interface HeartbeatInput {
  bytesEstimate?: number;
}

/** POST /streams/:id/end — backend endSessionBodySchema. */
export interface EndSessionInput {
  reason?: string;
}

/** GET /streams — backend sessionListQuerySchema. */
export interface SessionListQuery {
  cameraId?: string;
}

export type RecordingTrack = 'MAIN' | 'SUB';

/** GET /cameras/:id/recording/segments row — prisma RecordingSegment. */
export interface RecordingSegment {
  id: string;
  cameraId: string;
  source: string;
  track: RecordingTrack;
  startAt: string;
  endAt: string;
  discoveredAt: string;
  createdAt: string;
  updatedAt: string;
}

/** GET /cameras/:id/recording/segments — backend segmentsQuerySchema. */
export interface SegmentsQuery {
  startAt: string;
  endAt: string;
  track?: RecordingTrack;
}

export type ClipStatus = 'QUEUED' | 'PROCESSING' | 'DONE' | 'FAILED';

/** POST /cameras/:id/clips · GET /clips · GET /clips/:id — backend toPublicClip(). */
export interface ClipExport {
  id: string;
  cameraId: string;
  requestedById: string;
  startAt: string;
  endAt: string;
  status: ClipStatus;
  sizeBytes: number | null;
  error: string | null;
  incidentId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Signed GET /files/download URL, present only once status === 'DONE'. */
  downloadUrl: string | null;
}

/** POST /cameras/:id/clips — backend createClipBodySchema. */
export interface CreateClipInput {
  startAt: string;
  endAt: string;
  incidentId?: string;
}

/** GET /clips — backend clipListQuerySchema. */
export interface ClipListQuery {
  cameraId?: string;
  status?: ClipStatus;
  incidentId?: string;
  limit?: number;
}

// ── Minimal camera-picker slice ─────────────────────────────────────────────
// Only what this feature needs from the cameras module (backend/src/modules/
// cameras/camera.schemas.ts + camera.service.ts sanitizeCamera()). Do NOT
// import from src/features/cameras/* (owned by a sibling agent) — this is a
// deliberately narrow, self-contained read.

export type CameraStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'MAINTENANCE' | 'UNKNOWN';

export interface CameraLite {
  id: string;
  siteId: string;
  cameraCode: string;
  name: string;
  status: CameraStatus;
  maintenanceMode: boolean;
}

/** GET /cameras — backend cameraListQuerySchema (PaginationSchema + siteId/routerId/status/q). */
export interface CameraListQuery {
  page?: number;
  limit?: number;
  siteId?: string;
  routerId?: string;
  status?: CameraStatus;
  q?: string;
}

/** GET /cameras response shape — camera.service.ts listCameras() returns { items, total, page, limit }. */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
