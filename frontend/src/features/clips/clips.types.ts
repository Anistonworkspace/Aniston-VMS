// Mirrors backend/src/modules/clips — clip.service.ts `toPublicClip` and
// clip.schemas.ts (createClipBodySchema / clip list query). Do not add fields
// the backend never returns.

export type ClipStatus = 'QUEUED' | 'PROCESSING' | 'DONE' | 'FAILED';

/** Shape of `toPublicClip` — GET /clips, GET /clips/:id, POST /cameras/:id/clips. */
export interface ClipExport {
  id: string;
  cameraId: string;
  requestedById: string;
  incidentId: string | null;
  /** ISO datetime — start of the requested footage window. */
  startAt: string;
  /** ISO datetime — end of the requested footage window. */
  endAt: string;
  status: ClipStatus;
  sizeBytes: number | null;
  /** Failure reason — only ever set when status is FAILED. */
  error: string | null;
  /** Signed download URL — non-null only once status is DONE (and within retention). */
  downloadUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Query params of GET /clips (all optional; scope is applied server-side). */
export interface ClipListQuery {
  cameraId?: string;
  status?: ClipStatus;
  incidentId?: string;
  limit?: number;
}

/** POST /cameras/:cameraId/clips — body is { startAt, endAt, incidentId? }. */
export interface CreateClipInput {
  cameraId: string;
  startAt: string;
  endAt: string;
  incidentId?: string;
}

/**
 * Client-side mirror of the backend env default CLIP_EXPORT_MAX_DURATION_MINUTES.
 * Used only for a friendly pre-submit hint — the server remains the source of
 * truth and re-validates every request.
 */
export const CLIP_MAX_DURATION_MINUTES = 60;

/** Client-side mirror of the backend env default CLIP_EXPORT_RETENTION_DAYS. */
export const CLIP_RETENTION_DAYS = 30;
