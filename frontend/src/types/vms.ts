// Aniston VMS domain types for the Overview dashboard (Stage 1).
// shared/src does not export zone/camera/incident contracts yet — when the
// backend contract lands in @aniston-vms/shared, replace these with the
// shared definitions (never import from prisma).

export type VmsRole =
  | 'SUPER_ADMIN'
  | 'PROJECT_ADMIN'
  | 'MONITORING_OPERATOR'
  | 'MAINTENANCE_ENGINEER'
  | 'CLIENT_VIEWER'
  | 'AUDITOR';

export type CameraStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'MAINTENANCE' | 'UNKNOWN';

/** Zone tint state for cards and sidebar dots — docs/04-uiux-brief.md §7. */
export type ZoneState = 'healthy' | 'warning' | 'critical' | 'maintenance';

export interface ZoneSummary {
  id: string;
  name: string;
  region: 'North' | 'South' | 'East' | 'West';
  cameraCount: number;
  criticalCount: number;
  warningCount: number;
  maintenanceCount: number;
  state: ZoneState;
}

// ── CR-8 zone drill-down (GET /dashboard/zones/:id) ──────────────────────────
// `type`/`severity`/`status` are backend Prisma enum strings (DETECTED,
// INVESTIGATING, …) which are broader than the simplified frontend unions, so
// they are kept as `string` and mapped to colours with defaulting lookups.
export interface ZoneOverviewSite {
  id: string;
  name: string;
  cameraCount: number;
  healthy: number;
  offline: number;
  warning: number;
  maintenance: number;
}

export interface ZoneOverviewCamera {
  id: string;
  cameraCode: string;
  name: string;
  siteName: string;
  status: CameraStatus;
  healthScore: number;
  lastSnapshotAt: string | null;
}

export interface ZoneOverviewIncident {
  id: string;
  incidentNumber: string;
  cameraCode: string | null;
  type: string;
  severity: string;
  status: string;
  firstDetectedAt: string;
}

export interface ZoneOverview {
  id: string;
  name: string;
  region: string;
  cameras: CameraStatusCounts;
  openIncidents: number;
  snapshotSuccess: { total: number; fresh: number; percent: number };
  activeLiveSessions: number;
  uptimePercent: number; // trailing-30 d fleet-average uptime
  sites: ZoneOverviewSite[];
  cameraList: ZoneOverviewCamera[];
  incidents: ZoneOverviewIncident[];
}

export type IncidentSeverity = 'CRITICAL' | 'WARNING' | 'MAINTENANCE';
export type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
export type IncidentKind = 'STREAM' | 'OFFLINE' | 'IMAGE' | 'SIGNAL' | 'MAINTENANCE';

export interface IncidentSummary {
  id: string;
  /** e.g. ANI-CAM-2026-000145 */
  code: string;
  /** e.g. CAM-042 */
  cameraLabel: string;
  title: string;
  zoneName: string;
  siteName: string;
  kind: IncidentKind;
  severity: IncidentSeverity;
  status: IncidentStatus;
  /** ISO timestamp */
  occurredAt: string;
  /** Display names — assignee first, then notified users. */
  assignees: string[];
  /** "+N" avatar-stack overflow count. */
  notifiedOverflow: number;
}

export interface HealthSummary {
  totalCameras: number;
  zoneCount: number;
  healthy: number;
  warning: number;
  critical: number;
  maintenance: number;
  unknown: number;
  /** Donut center value (healthy share / uptime). */
  uptimePercent: number;
}

export interface EvidenceSnapshot {
  id: string;
  cameraLabel: string;
  zoneName: string;
  siteName: string;
  capturedAt: string;
  /** Signed, short-lived thumbnail URL (GET /api/snapshots/:id/file?variant=thumb). */
  imageUrl: string;
}

// ── CR-2 dashboard overview (real backend: GET /api/dashboard/overview) ──
// Mirrors backend/src/modules/dashboard/dashboard.service.ts exactly. Every
// count/list is scope-filtered server-side through user_access_scopes.
export interface CameraStatusCounts {
  total: number;
  healthy: number;
  offline: number; // CameraStatus.CRITICAL → "Unavailable/Offline" tile
  warning: number;
  maintenance: number;
  unknown: number;
}

export interface WorstConnection {
  cameraId: string;
  cameraCode: string;
  name: string;
  siteName: string;
  status: CameraStatus;
  healthScore: number;
  diagnosis: string | null;
}

export interface MissingSnapshot {
  cameraId: string;
  cameraCode: string;
  name: string;
  siteName: string;
  lastSnapshotAt: string | null;
}

export interface DashboardOverview {
  cameras: CameraStatusCounts;
  openIncidents: number;
  snapshotSuccess: { total: number; fresh: number; percent: number };
  activeLiveSessions: number;
  worstConnections: WorstConnection[];
  missingSnapshots: MissingSnapshot[];
}

export interface CurrentUser {
  id: string;
  name: string;
  role: VmsRole;
  roleLabel: string;
}

// NOTE: rule-frontend.md expects hasPermission() from
// '@aniston-vms/shared/permissions', which shared/src does not ship yet.
// Local stand-in kept inside frontend/ (hard boundary) — swap it out once
// the shared helper exists.
const REGISTRY_ADMIN_ROLES: readonly VmsRole[] = ['SUPER_ADMIN', 'PROJECT_ADMIN'];

export function canManageRegistry(role: VmsRole): boolean {
  return REGISTRY_ADMIN_ROLES.includes(role);
}
