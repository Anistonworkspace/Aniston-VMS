// Aniston VMS domain types for the Overview dashboard (Stage 1).
// shared/src does not export zone/camera/incident contracts yet — when the
// backend contract lands in @boilerplate/shared, replace these with the
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
}

export interface CurrentUser {
  id: string;
  name: string;
  role: VmsRole;
  roleLabel: string;
}

// NOTE: rule-frontend.md expects hasPermission() from
// '@boilerplate/shared/permissions', which shared/src does not ship yet.
// Local stand-in kept inside frontend/ (hard boundary) — swap it out once
// the shared helper exists.
const REGISTRY_ADMIN_ROLES: readonly VmsRole[] = ['SUPER_ADMIN', 'PROJECT_ADMIN'];

export function canManageRegistry(role: VmsRole): boolean {
  return REGISTRY_ADMIN_ROLES.includes(role);
}
