// Shapes mirror the backend exactly:
// - layouts:  backend/src/modules/layouts/layout.service.ts  LayoutDto
//   (wire field is `kind`; the Prisma column `layout` is mapped server-side)
// - playback: backend/src/modules/playback/playback.service.ts toPublicSession
//   + mediamtx.adapter.ts StreamEndpoints (hlsUrl/webrtcUrl/rtspUrl trio)
// All Date fields arrive as ISO strings over JSON.

export type LayoutKind = 'L1x1' | 'L2x2' | 'L3x2';

export interface SavedLayout {
  id: string;
  userId: string;
  name: string;
  kind: LayoutKind;
  cameraIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** POST /saved-layouts — createLayoutBodySchema (cameraIds.length <= max for kind). */
export interface CreateLayoutInput {
  name: string;
  kind: LayoutKind;
  cameraIds: string[];
}

/** PATCH /saved-layouts/:id — updateLayoutBodySchema (at least one field). */
export interface UpdateLayoutInput {
  name?: string;
  kind?: LayoutKind;
  cameraIds?: string[];
}

export type StreamKind = 'LIVE_SUB' | 'LIVE_MAIN' | 'PLAYBACK';

export interface StreamSession {
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
  /** True when the backend runs PLAYBACK_SIM_MODE — URLs are synthetic. */
  simMode: boolean;
  mediamtxPath: string;
  hlsUrl: string;
  webrtcUrl: string;
  rtspUrl: string;
}

/** POST /streams/start — startAt/endAt only valid (and required) for PLAYBACK. */
export interface StartStreamInput {
  cameraId: string;
  kind: StreamKind;
  startAt?: string;
  endAt?: string;
}
