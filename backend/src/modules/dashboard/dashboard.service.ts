import type { CameraStatus, IncidentStatus, Prisma, Severity } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { cameraScopeWhere, getUserScope, zoneScopeWhere } from '../../lib/scope.js';
import { NotFoundError } from '../../middleware/errorHandler.js';
import { OPEN_STATUS_LIST } from '../incidents/incident.constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// CR-2 dashboard overview aggregate. Every count/list below is filtered through
// the caller's user_access_scopes (lib/scope.ts) so the KPI row and the two
// widgets are strictly scope-aware — a SITE-scoped operator sees only their
// cameras/incidents/sessions, an ALL-scoped admin sees everything.
// ─────────────────────────────────────────────────────────────────────────────

const SNAPSHOT_FRESH_MS = 24 * 60 * 60 * 1000; // "Snapshot success (24 h)" window
const WIDGET_LIMIT = 5; // rows shown in Worst-connections / Missing-snapshots

export interface CameraStatusCounts {
  total: number;
  healthy: number; // CameraStatus.HEALTHY
  offline: number; // CameraStatus.CRITICAL → "Unavailable/Offline" tile
  warning: number; // CameraStatus.WARNING
  maintenance: number; // CameraStatus.MAINTENANCE
  unknown: number; // CameraStatus.UNKNOWN (counted in total, no own tile)
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

export async function getDashboardOverview(userId: string): Promise<DashboardOverview> {
  const scope = await getUserScope(userId);
  // Operational dashboards report CONFIGURED cameras only: DRAFT cameras are
  // identity-only, unplaced, and have never streamed, so they carry no health
  // status, snapshots, or live sessions. (A CONFIGURED camera always has a site
  // — enforced at the configure gate — so the `site!` reads below are sound.)
  const cameraWhere: Prisma.CameraWhereInput = {
    AND: [cameraScopeWhere(scope), { provisioningState: 'CONFIGURED' }],
  };
  const since = new Date(Date.now() - SNAPSHOT_FRESH_MS);

  const [
    grouped,
    openIncidents,
    activeLiveSessions,
    snapEligible,
    snapFresh,
    worstRows,
    missingRows,
  ] = await Promise.all([
    prisma.camera.groupBy({ by: ['status'], where: cameraWhere, _count: { _all: true } }),
    prisma.incident.count({
      where: { zone: zoneScopeWhere(scope), status: { in: OPEN_STATUS_LIST } },
    }),
    prisma.streamSession.count({ where: { endedAt: null, camera: cameraWhere } }),
    // Snapshot success denominator: in-service cameras (maintenance excluded).
    prisma.camera.count({ where: { AND: [cameraWhere, { maintenanceMode: false }] } }),
    // Numerator: in-service cameras with a snapshot captured in the last 24 h.
    prisma.camera.count({
      where: {
        AND: [cameraWhere, { maintenanceMode: false }, { lastSnapshotAt: { gte: since } }],
      },
    }),
    // Worst connections: lowest health scores among non-healthy, in-service cams.
    prisma.camera.findMany({
      where: {
        AND: [
          cameraWhere,
          { maintenanceMode: false },
          { status: { in: ['CRITICAL', 'WARNING', 'UNKNOWN'] } },
        ],
      },
      orderBy: [{ healthScore: 'asc' }, { cameraCode: 'asc' }],
      take: WIDGET_LIMIT,
      select: {
        id: true,
        cameraCode: true,
        name: true,
        status: true,
        healthScore: true,
        diagnosis: true,
        site: { select: { name: true } },
      },
    }),
    // Missing snapshots: in-service cams with no snapshot or a stale one (>24 h).
    prisma.camera.findMany({
      where: {
        AND: [
          cameraWhere,
          { maintenanceMode: false },
          { OR: [{ lastSnapshotAt: null }, { lastSnapshotAt: { lt: since } }] },
        ],
      },
      orderBy: [{ lastSnapshotAt: { sort: 'asc', nulls: 'first' } }, { cameraCode: 'asc' }],
      take: WIDGET_LIMIT,
      select: {
        id: true,
        cameraCode: true,
        name: true,
        lastSnapshotAt: true,
        site: { select: { name: true } },
      },
    }),
  ]);

  const counts: CameraStatusCounts = {
    total: 0,
    healthy: 0,
    offline: 0,
    warning: 0,
    maintenance: 0,
    unknown: 0,
  };
  for (const row of grouped) {
    const n = row._count._all;
    counts.total += n;
    if (row.status === 'HEALTHY') counts.healthy = n;
    else if (row.status === 'CRITICAL') counts.offline = n;
    else if (row.status === 'WARNING') counts.warning = n;
    else if (row.status === 'MAINTENANCE') counts.maintenance = n;
    else if (row.status === 'UNKNOWN') counts.unknown = n;
  }

  const percent = snapEligible === 0 ? 100 : Math.round((snapFresh / snapEligible) * 100);

  return {
    cameras: counts,
    openIncidents,
    snapshotSuccess: { total: snapEligible, fresh: snapFresh, percent },
    activeLiveSessions,
    worstConnections: worstRows.map((c) => ({
      cameraId: c.id,
      cameraCode: c.cameraCode,
      name: c.name,
      siteName: c.site!.name,
      status: c.status,
      healthScore: c.healthScore,
      diagnosis: c.diagnosis,
    })),
    missingSnapshots: missingRows.map((c) => ({
      cameraId: c.id,
      cameraCode: c.cameraCode,
      name: c.name,
      siteName: c.site!.name,
      lastSnapshotAt: c.lastSnapshotAt ? c.lastSnapshotAt.toISOString() : null,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CR-8 zone drill-down. The sidebar/dashboard zone cards are backed by
// listZoneSummaries() (real zone IDs, scope-filtered) and each opens a populated
// /zones/:id overview via getZoneOverview(). All counts/lists respect the
// caller's user_access_scopes exactly like the CR-2 dashboard aggregate.
// ─────────────────────────────────────────────────────────────────────────────

export type ZoneState = 'healthy' | 'warning' | 'critical' | 'maintenance';

// Region.name is seeded as a cardinal ("North"/"South"/"East"/"West"); guard the
// mapping so an unexpected label can never violate the ZoneSummary contract.
const CARDINAL_REGIONS = ['North', 'South', 'East', 'West'] as const;
type CardinalRegion = (typeof CARDINAL_REGIONS)[number];
function toRegionLabel(name: string): CardinalRegion {
  return CARDINAL_REGIONS.find((c) => name.includes(c)) ?? 'North';
}

export interface ZoneSummaryDto {
  id: string;
  name: string;
  region: CardinalRegion;
  cameraCount: number;
  criticalCount: number;
  warningCount: number;
  maintenanceCount: number;
  state: ZoneState;
}

function deriveZoneState(critical: number, warning: number, maintenance: number): ZoneState {
  if (critical > 0) return 'critical';
  if (warning > 0) return 'warning';
  if (maintenance > 0) return 'maintenance';
  return 'healthy';
}

/**
 * Scope-aware zone cards for the sidebar + dashboard zone grid. Camera status is
 * rolled up per zone from the caller's in-scope cameras (via site→zone).
 */
export async function listZoneSummaries(userId: string): Promise<ZoneSummaryDto[]> {
  const scope = await getUserScope(userId);
  const [zones, cameras] = await Promise.all([
    prisma.zone.findMany({
      where: zoneScopeWhere(scope),
      select: { id: true, name: true, region: { select: { name: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.camera.findMany({
      // CONFIGURED only: DRAFT cameras are unplaced (no site/zone) and pending.
      where: { AND: [cameraScopeWhere(scope), { provisioningState: 'CONFIGURED' }] },
      select: { status: true, site: { select: { zoneId: true } } },
    }),
  ]);

  const byZone = new Map<
    string,
    { total: number; critical: number; warning: number; maintenance: number }
  >();
  for (const cam of cameras) {
    const zid = cam.site!.zoneId;
    const c = byZone.get(zid) ?? { total: 0, critical: 0, warning: 0, maintenance: 0 };
    c.total += 1;
    if (cam.status === 'CRITICAL') c.critical += 1;
    else if (cam.status === 'WARNING') c.warning += 1;
    else if (cam.status === 'MAINTENANCE') c.maintenance += 1;
    byZone.set(zid, c);
  }

  return zones.map((z) => {
    const c = byZone.get(z.id) ?? { total: 0, critical: 0, warning: 0, maintenance: 0 };
    return {
      id: z.id,
      name: z.name,
      region: toRegionLabel(z.region.name),
      cameraCount: c.total,
      criticalCount: c.critical,
      warningCount: c.warning,
      maintenanceCount: c.maintenance,
      state: deriveZoneState(c.critical, c.warning, c.maintenance),
    };
  });
}

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
  severity: Severity;
  status: IncidentStatus;
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
  uptimePercent: number; // fleet-average over the trailing 30 d
  sites: ZoneOverviewSite[];
  cameraList: ZoneOverviewCamera[];
  incidents: ZoneOverviewIncident[];
}

const ZONE_UPTIME_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // trailing 30 d fleet uptime

/**
 * Populated drill-down for a single zone: KPI counts, per-site breakdown, camera
 * roster, open incidents and a trailing-30 d fleet uptime. Throws NotFoundError
 * when the zone is outside the caller's scope (mirrors the hierarchy service).
 */
export async function getZoneOverview(zoneId: string, userId: string): Promise<ZoneOverview> {
  const scope = await getUserScope(userId);

  const zone = await prisma.zone.findFirst({
    where: { AND: [{ id: zoneId }, zoneScopeWhere(scope)] },
    select: { id: true, name: true, region: { select: { name: true } } },
  });
  if (!zone) throw new NotFoundError('Zone not found');

  // CONFIGURED only: DRAFT cameras have no site placement and never stream, so
  // the `{ site: { zoneId } }` filter already excludes them, but stating the
  // provisioning state keeps intent explicit and the `site!` reads below sound.
  const cameraWhere: Prisma.CameraWhereInput = {
    AND: [cameraScopeWhere(scope), { site: { zoneId } }, { provisioningState: 'CONFIGURED' }],
  };
  const since = new Date(Date.now() - SNAPSHOT_FRESH_MS);
  const windowStart = new Date(Date.now() - ZONE_UPTIME_WINDOW_MS);

  const [cams, openIncidentRows, activeLiveSessions, uptimeIncidents] = await Promise.all([
    prisma.camera.findMany({
      where: cameraWhere,
      orderBy: [{ cameraCode: 'asc' }],
      select: {
        id: true,
        cameraCode: true,
        name: true,
        status: true,
        healthScore: true,
        lastSnapshotAt: true,
        maintenanceMode: true,
        site: { select: { id: true, name: true } },
      },
    }),
    prisma.incident.findMany({
      where: { zoneId, status: { in: OPEN_STATUS_LIST } },
      orderBy: [{ firstDetectedAt: 'desc' }],
      select: {
        id: true,
        incidentNumber: true,
        type: true,
        severity: true,
        status: true,
        firstDetectedAt: true,
        camera: { select: { cameraCode: true } },
      },
    }),
    prisma.streamSession.count({ where: { endedAt: null, camera: cameraWhere } }),
    prisma.incident.findMany({
      where: {
        zoneId,
        OR: [{ firstDetectedAt: { gte: windowStart } }, { status: { in: OPEN_STATUS_LIST } }],
      },
      select: { downtimeSeconds: true, firstDetectedAt: true, status: true },
    }),
  ]);

  const counts: CameraStatusCounts = {
    total: 0,
    healthy: 0,
    offline: 0,
    warning: 0,
    maintenance: 0,
    unknown: 0,
  };
  const siteMap = new Map<string, ZoneOverviewSite>();
  let snapEligible = 0;
  let snapFresh = 0;

  for (const cam of cams) {
    counts.total += 1;
    if (cam.status === 'HEALTHY') counts.healthy += 1;
    else if (cam.status === 'CRITICAL') counts.offline += 1;
    else if (cam.status === 'WARNING') counts.warning += 1;
    else if (cam.status === 'MAINTENANCE') counts.maintenance += 1;
    else if (cam.status === 'UNKNOWN') counts.unknown += 1;

    if (!cam.maintenanceMode) {
      snapEligible += 1;
      if (cam.lastSnapshotAt && cam.lastSnapshotAt >= since) snapFresh += 1;
    }

    const s = siteMap.get(cam.site!.id) ?? {
      id: cam.site!.id,
      name: cam.site!.name,
      cameraCount: 0,
      healthy: 0,
      offline: 0,
      warning: 0,
      maintenance: 0,
    };
    s.cameraCount += 1;
    if (cam.status === 'HEALTHY') s.healthy += 1;
    else if (cam.status === 'CRITICAL') s.offline += 1;
    else if (cam.status === 'WARNING') s.warning += 1;
    else if (cam.status === 'MAINTENANCE') s.maintenance += 1;
    siteMap.set(cam.site!.id, s);
  }

  const percent = snapEligible === 0 ? 100 : Math.round((snapFresh / snapEligible) * 100);

  // Trailing-30 d fleet-average uptime: (1 − Σdowntime / (cameras × window)).
  // Resolved incidents contribute their recorded downtimeSeconds; still-open
  // incidents contribute the elapsed time since first detection.
  const now = Date.now();
  let totalDowntime = 0;
  for (const inc of uptimeIncidents) {
    if (inc.downtimeSeconds != null) {
      totalDowntime += inc.downtimeSeconds;
    } else if (OPEN_STATUS_LIST.includes(inc.status)) {
      totalDowntime += Math.max(0, (now - inc.firstDetectedAt.getTime()) / 1000);
    }
  }
  const denom = counts.total * (ZONE_UPTIME_WINDOW_MS / 1000);
  const uptimePercent =
    denom === 0
      ? 100
      : Math.round(Math.max(0, Math.min(100, (1 - totalDowntime / denom) * 100)) * 100) / 100;

  return {
    id: zone.id,
    name: zone.name,
    region: zone.region.name,
    cameras: counts,
    openIncidents: openIncidentRows.length,
    snapshotSuccess: { total: snapEligible, fresh: snapFresh, percent },
    activeLiveSessions,
    uptimePercent,
    sites: [...siteMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    cameraList: cams.map((c) => ({
      id: c.id,
      cameraCode: c.cameraCode,
      name: c.name,
      siteName: c.site!.name,
      status: c.status,
      healthScore: c.healthScore,
      lastSnapshotAt: c.lastSnapshotAt ? c.lastSnapshotAt.toISOString() : null,
    })),
    incidents: openIncidentRows.map((i) => ({
      id: i.id,
      incidentNumber: i.incidentNumber,
      cameraCode: i.camera?.cameraCode ?? null,
      type: i.type,
      severity: i.severity,
      status: i.status,
      firstDetectedAt: i.firstDetectedAt.toISOString(),
    })),
  };
}
