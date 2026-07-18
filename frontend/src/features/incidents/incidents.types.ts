// Shapes mirror backend/src/modules/incidents exactly:
// - incident.schemas.ts  → list filters, assign/status/resolve bodies
// - incident.service.ts  → listInclude (camera/site/zone/assignedTo selects),
//   getIncidentDetail (adds snapshots refs + events + notifications)
// All Date fields arrive as ISO strings over JSON.

import type { Role } from '@/features/auth/auth.types';

export type IncidentStatus =
  | 'DETECTED'
  | 'CONFIRMED'
  | 'ALERTED'
  | 'ACKNOWLEDGED'
  | 'ASSIGNED'
  | 'INVESTIGATING'
  | 'RESOLVED'
  | 'RECOVERY_VERIFIED'
  | 'CLOSED';

export type IncidentSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface IncidentListItem {
  id: string;
  /** e.g. "ANI-CAM-2026-000145". */
  incidentNumber: string;
  cameraId: string | null;
  siteId: string;
  zoneId: string;
  /** Diagnosis string, e.g. CAMERA_OFFLINE (site-scope incidents have cameraId null). */
  type: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  diagnosis: string | null;
  firstDetectedAt: string;
  lastDetectedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  assignedToId: string | null;
  resolvedAt: string | null;
  recoveryVerifiedAt: string | null;
  closedAt: string | null;
  rootCause: string | null;
  resolutionNotes: string | null;
  correctiveAction: string | null;
  spareParts: string | null;
  downtimeSeconds: number | null;
  slaImpact: boolean;
  createdAt: string;
  updatedAt: string;
  camera: { id: string; cameraCode: string; name: string } | null;
  site: { id: string; name: string };
  zone: { id: string; name: string };
  assignedTo: { id: string; email: string } | null;
}

export interface IncidentEvent {
  id: string;
  incidentId: string;
  actor: string | null;
  event: string;
  detail: unknown;
  createdAt: string;
}

export interface IncidentNotification {
  id: string;
  incidentId: string;
  channel: 'EMAIL' | 'WHATSAPP';
  recipient: string;
  templateName: string;
  status: string;
  attemptCount: number;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  createdAt: string;
}

/** Evidence refs carry no signed URL — resolve images via the camera snapshot list. */
export interface EvidenceRef {
  id: string;
  capturedAt: string;
}

export interface IncidentDetail extends IncidentListItem {
  previousSnapshot: EvidenceRef | null;
  faultSnapshot: EvidenceRef | null;
  events: IncidentEvent[];
  notifications: IncidentNotification[];
}

/** GET /incidents — incidentListQuerySchema (no pagination, `limit` max 200). */
export interface IncidentListQuery {
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  zoneId?: string;
  cameraId?: string;
  limit?: number;
}

/** POST /incidents/:id/resolve — resolveBodySchema. */
export interface ResolveIncidentInput {
  rootCause: string;
  resolutionNotes: string;
  correctiveAction?: string;
  spareParts?: string;
}

/** Minimal mutation result — consumers rely on tag invalidation for fresh data. */
export interface IncidentMutationResult {
  id: string;
  status: IncidentStatus;
}

/** GET /users list item (admin module) — used for the assign picker.
 *  Mirrors admin/users.service.ts's `toPublicUser` (same fields as auth's
 *  PublicUser minus phone/mfaEnabled/lastLoginAt, which the picker doesn't need). */
export interface AdminUserLite {
  id: string;
  email: string;
  name: string;
  role: Role;
}
