import type { IncidentStatus, Severity } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { cameraScopeWhere, getUserScope, zoneScopeWhere } from '../../lib/scope.js';
import { OPEN_STATUS_LIST } from '../incidents/incident.constants.js';
import { DIAGNOSIS_TEXT } from '../health/health.diagnosis.js';
import { signFileUrl } from '../snapshots/snapshot.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// CR-2 Overview-page widgets (the landing dashboard's three secondary cards).
// These previously stood in for by src/mocks/vms-fixtures.ts on the frontend;
// this module is the real, scope-aware backend behind them. Every read is
// filtered through the caller's user_access_scopes (lib/scope.ts), so a
// SITE-scoped operator sees only their own cameras / incidents / snapshots.
//
// The DTO shapes below MIRROR frontend/src/types/vms.ts EXACTLY (HealthSummary,
// IncidentSummary, EvidenceSnapshot) — keep them in lockstep. No schema change.
// ─────────────────────────────────────────────────────────────────────────────

const WIDGET_LIMIT = 5; // recent-incidents feed rows

// ── Health summary ───────────────────────────────────────────────────────────
export interface HealthSummaryDto {
  totalCameras: number;
  zoneCount: number;
  healthy: number;
  warning: number;
  critical: number;
  maintenance: number;
  unknown: number;
  uptimePercent: number;
}

export async function getHealthSummary(userId: string): Promise<HealthSummaryDto> {
  const scope = await getUserScope(userId);
  const [byStatus, zoneCount] = await Promise.all([
    prisma.camera.groupBy({
      by: ['status'],
      where: cameraScopeWhere(scope),
      _count: { _all: true },
    }),
    prisma.zone.count({ where: zoneScopeWhere(scope) }),
  ]);

  const counts = { healthy: 0, warning: 0, critical: 0, maintenance: 0, unknown: 0 };
  let totalCameras = 0;
  for (const row of byStatus) {
    const n = row._count._all;
    totalCameras += n;
    switch (row.status) {
      case 'HEALTHY':
        counts.healthy = n;
        break;
      case 'WARNING':
        counts.warning = n;
        break;
      case 'CRITICAL':
        counts.critical = n;
        break;
      case 'MAINTENANCE':
        counts.maintenance = n;
        break;
      case 'UNKNOWN':
        counts.unknown = n;
        break;
    }
  }

  // Uptime proxy = share of cameras currently HEALTHY, rounded to 1 dp.
  const uptimePercent =
    totalCameras > 0 ? Math.round((counts.healthy / totalCameras) * 1000) / 10 : 100;

  return { totalCameras, zoneCount, ...counts, uptimePercent };
}

// ── Recent-incidents feed ────────────────────────────────────────────────────
export type IncidentKind = 'STREAM' | 'OFFLINE' | 'IMAGE' | 'SIGNAL' | 'MAINTENANCE';
export type IncidentSummarySeverity = 'CRITICAL' | 'WARNING' | 'MAINTENANCE';
export type IncidentSummaryStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface IncidentSummaryDto {
  id: string;
  code: string;
  cameraLabel: string;
  title: string;
  zoneName: string;
  siteName: string;
  kind: IncidentKind;
  severity: IncidentSummarySeverity;
  status: IncidentSummaryStatus;
  occurredAt: string;
  assignees: string[];
  notifiedOverflow: number;
}

// incident.type carries the Diagnosis vocabulary (health.diagnosis.ts). Collapse
// it onto the 5 frontend badge kinds; unknown/maintenance types fall back to
// OFFLINE so a stray value never crashes the badge renderer.
const INCIDENT_KIND_BY_TYPE: Record<string, IncidentKind> = {
  STREAM_DEGRADED: 'STREAM',
  CAMERA_OFFLINE: 'OFFLINE',
  CONFIG_ERROR: 'OFFLINE',
  IMAGE_PROBLEM: 'IMAGE',
  WATERLOGGING: 'IMAGE',
  SITE_INTERNET_DOWN: 'SIGNAL',
  SIM_SIGNAL_ISSUE: 'SIGNAL',
  NETWORK_UNSTABLE: 'SIGNAL',
};

function toIncidentSeverity(severity: Severity): IncidentSummarySeverity {
  // Backend Severity is INFO | WARNING | CRITICAL; the overview badge has no
  // INFO tier, so INFO folds into the WARNING badge.
  return severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING';
}

function toIncidentSummaryStatus(status: IncidentStatus): IncidentSummaryStatus {
  switch (status) {
    case 'RESOLVED':
    case 'RECOVERY_VERIFIED':
    case 'CLOSED':
      return 'RESOLVED';
    case 'ACKNOWLEDGED':
    case 'ASSIGNED':
    case 'INVESTIGATING':
      return 'ACKNOWLEDGED';
    default:
      return 'OPEN'; // DETECTED / CONFIRMED / ALERTED
  }
}

export async function listRecentIncidentSummaries(
  userId: string,
  limit = WIDGET_LIMIT,
): Promise<IncidentSummaryDto[]> {
  const scope = await getUserScope(userId);
  const rows = await prisma.incident.findMany({
    where: { zone: zoneScopeWhere(scope), status: { in: OPEN_STATUS_LIST } },
    orderBy: { lastDetectedAt: 'desc' },
    take: limit,
    include: {
      camera: { select: { cameraCode: true } },
      site: { select: { name: true } },
      zone: { select: { name: true } },
      assignedTo: { select: { name: true } },
      _count: { select: { notifications: true } },
    },
  });

  return rows.map((inc) => ({
    id: inc.id,
    code: inc.incidentNumber,
    cameraLabel: inc.camera?.cameraCode ?? '—',
    title: (DIAGNOSIS_TEXT as Record<string, string>)[inc.type] ?? inc.type,
    zoneName: inc.zone.name,
    siteName: inc.site.name,
    kind: INCIDENT_KIND_BY_TYPE[inc.type] ?? 'OFFLINE',
    severity: toIncidentSeverity(inc.severity),
    status: toIncidentSummaryStatus(inc.status),
    occurredAt: inc.firstDetectedAt.toISOString(),
    assignees: inc.assignedTo ? [inc.assignedTo.name] : [],
    notifiedOverflow: inc._count.notifications,
  }));
}

// ── Latest evidence snapshot ─────────────────────────────────────────────────
export interface EvidenceSnapshotDto {
  id: string;
  cameraLabel: string;
  zoneName: string;
  siteName: string;
  capturedAt: string;
  imageUrl: string;
}

export async function getLatestEvidence(userId: string): Promise<EvidenceSnapshotDto | null> {
  const scope = await getUserScope(userId);
  const snap = await prisma.snapshot.findFirst({
    where: { kind: 'EVIDENCE', camera: cameraScopeWhere(scope) },
    orderBy: { capturedAt: 'desc' },
    include: {
      camera: {
        select: {
          cameraCode: true,
          site: { select: { name: true, zone: { select: { name: true } } } },
        },
      },
    },
  });
  if (!snap) return null;

  return {
    id: snap.id,
    cameraLabel: snap.camera.cameraCode,
    zoneName: snap.camera.site.zone.name,
    siteName: snap.camera.site.name,
    capturedAt: snap.capturedAt.toISOString(),
    imageUrl: signFileUrl(snap.id, 'thumb'),
  };
}
