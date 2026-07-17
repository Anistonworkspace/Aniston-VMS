// ============================================================
// MOCK DATA — Stage 1 UI foundation only.
// Consumed exclusively by src/features/overview/overview.api.ts
// queryFn endpoints so the dashboard renders without a backend.
// Delete this file when the real /api endpoints ship — the RTK
// Query hooks and consumers stay unchanged.
//
// Shapes: src/types/vms.ts
// Content: docs/01-PRD.md §F1 seeded Delhi structure —
// 13 zones · 125 cameras · health 116/5/3/1 (docs/04-uiux-brief.md §7).
// ============================================================
import type {
  CurrentUser,
  EvidenceSnapshot,
  HealthSummary,
  IncidentSummary,
  ZoneSummary,
} from '@/types/vms';

const minutesAgo = (minutes: number): string =>
  new Date(Date.now() - minutes * 60_000).toISOString();

/** 13 Delhi zones, camera counts sum to 125. */
export const mockZones: ZoneSummary[] = [
  { id: 'z-rohini', name: 'Rohini', region: 'North', cameraCount: 38, criticalCount: 2, warningCount: 0, maintenanceCount: 0, state: 'critical' },
  { id: 'z-karol-bagh', name: 'Karol Bagh (CTSP)', region: 'North', cameraCount: 26, criticalCount: 0, warningCount: 0, maintenanceCount: 1, state: 'maintenance' },
  { id: 'z-civil-lines', name: 'Civil Lines', region: 'North', cameraCount: 12, criticalCount: 0, warningCount: 0, maintenanceCount: 0, state: 'healthy' },
  { id: 'z-keshav-puram', name: 'Keshav Puram', region: 'North', cameraCount: 8, criticalCount: 0, warningCount: 2, maintenanceCount: 0, state: 'warning' },
  { id: 'z-narela', name: 'Narela', region: 'North', cameraCount: 7, criticalCount: 0, warningCount: 1, maintenanceCount: 0, state: 'warning' },
  { id: 'z-central', name: 'Central', region: 'South', cameraCount: 6, criticalCount: 0, warningCount: 0, maintenanceCount: 0, state: 'healthy' },
  { id: 'z-hauz-khas', name: 'Hauz Khas', region: 'South', cameraCount: 5, criticalCount: 0, warningCount: 1, maintenanceCount: 0, state: 'warning' },
  { id: 'z-shahdara-s1', name: 'Shahdara South 1', region: 'East', cameraCount: 5, criticalCount: 1, warningCount: 0, maintenanceCount: 0, state: 'critical' },
  { id: 'z-rajouri', name: 'Rajouri Garden', region: 'West', cameraCount: 4, criticalCount: 0, warningCount: 0, maintenanceCount: 0, state: 'healthy' },
  { id: 'z-shahdara-n1', name: 'Shahdara North 1', region: 'East', cameraCount: 4, criticalCount: 0, warningCount: 0, maintenanceCount: 0, state: 'healthy' },
  { id: 'z-shahdara-s2', name: 'Shahdara South 2', region: 'East', cameraCount: 4, criticalCount: 0, warningCount: 0, maintenanceCount: 0, state: 'healthy' },
  { id: 'z-najafgarh', name: 'Najafgarh', region: 'West', cameraCount: 3, criticalCount: 0, warningCount: 1, maintenanceCount: 0, state: 'warning' },
  { id: 'z-shahdara-n2', name: 'Shahdara North 2', region: 'East', cameraCount: 3, criticalCount: 0, warningCount: 0, maintenanceCount: 0, state: 'healthy' },
];

export const mockHealthSummary: HealthSummary = {
  totalCameras: 125,
  zoneCount: 13,
  healthy: 116,
  warning: 5,
  critical: 3,
  maintenance: 1,
  unknown: 0,
  uptimePercent: 92.8,
};

export const mockRecentIncidents: IncidentSummary[] = [
  {
    id: 'inc-145',
    code: 'ANI-CAM-2026-000145',
    cameraLabel: 'CAM-042',
    title: 'RTSP stream unavailable',
    zoneName: 'Rohini',
    siteName: 'Rohini Zone 4',
    kind: 'STREAM',
    severity: 'CRITICAL',
    status: 'OPEN',
    occurredAt: minutesAgo(8),
    assignees: ['Vikram Joshi', 'Sana Khan'],
    notifiedOverflow: 4,
  },
  {
    id: 'inc-144',
    code: 'ANI-CAM-2026-000144',
    cameraLabel: 'CAM-118',
    title: 'Black image detected',
    zoneName: 'Shahdara South 1',
    siteName: 'Shahdara South 1',
    kind: 'IMAGE',
    severity: 'CRITICAL',
    status: 'ACKNOWLEDGED',
    occurredAt: minutesAgo(26),
    assignees: ['Ravi Patel'],
    notifiedOverflow: 2,
  },
  {
    id: 'inc-143',
    code: 'ANI-CAM-2026-000143',
    cameraLabel: 'CAM-063',
    title: 'Site internet down — SIM unreachable',
    zoneName: 'Rohini',
    siteName: 'Rohini Gate 2',
    kind: 'OFFLINE',
    severity: 'CRITICAL',
    status: 'OPEN',
    occurredAt: minutesAgo(54),
    assignees: ['Sana Khan'],
    notifiedOverflow: 3,
  },
  {
    id: 'inc-142',
    code: 'ANI-CAM-2026-000142',
    cameraLabel: 'CAM-076',
    title: 'Weak SIM signal (RSRP −112 dBm)',
    zoneName: 'Keshav Puram',
    siteName: 'Keshav Puram Market',
    kind: 'SIGNAL',
    severity: 'WARNING',
    status: 'OPEN',
    occurredAt: minutesAgo(150),
    assignees: ['Meera Nair'],
    notifiedOverflow: 1,
  },
  {
    id: 'inc-141',
    code: 'ANI-CAM-2026-000141',
    cameraLabel: 'CAM-018',
    title: 'Scheduled lens cleaning',
    zoneName: 'Karol Bagh (CTSP)',
    siteName: 'Karol Bagh Depot',
    kind: 'MAINTENANCE',
    severity: 'MAINTENANCE',
    status: 'ACKNOWLEDGED',
    occurredAt: minutesAgo(320),
    assignees: ['Arjun Mehta', 'Ravi Patel'],
    notifiedOverflow: 0,
  },
];

export const mockLatestEvidence: EvidenceSnapshot = {
  id: 'ev-1',
  cameraLabel: 'CAM-042',
  zoneName: 'Rohini',
  siteName: 'Rohini Gate 2',
  capturedAt: minutesAgo(2),
};

export const mockCurrentUser: CurrentUser = {
  id: 'u-1',
  name: 'Asha Verma',
  role: 'PROJECT_ADMIN',
  roleLabel: 'Project Admin',
};
