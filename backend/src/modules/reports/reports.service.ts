import type { Diagnosis, IncidentStatus, Severity, Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import {
  getUserScope,
  cameraScopeWhere,
  zoneScopeWhere,
  type ResolvedScope,
} from '../../lib/scope.js';
import { ValidationError } from '../../middleware/errorHandler.js';
import {
  calculateUptimePercent,
  calculateMTTA,
  calculateMTTR,
  calculateIncidentCountsBySeverity,
  calculateSlaCompliance,
} from './reports.calc.js';
import type { UptimeReportQuery, IncidentsReportQuery } from './reports.schemas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Reporting read-side: fetches rows from Prisma (scoped through lib/scope.ts,
// same as every other feature module) and shapes them into the plain input
// types reports.calc.ts's pure functions expect. Dates are kept as real `Date`
// objects (not pre-stringified) — Express's res.json()/JSON.stringify already
// serializes Date -> ISO 8601 string, and reports.export.ts wants real Dates
// to format cells/text.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rejects any report request whose [startDate, endDate] window is inverted or
 * wider than REPORTS_MAX_RANGE_DAYS. Throws the same ValidationError every
 * other business-rule rejection uses so it renders identically on the client.
 */
export function assertRangeWithinLimit(startDate: Date, endDate: Date): void {
  if (endDate.getTime() < startDate.getTime()) {
    throw new ValidationError('endDate must not be before startDate');
  }
  const rangeDays = (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000);
  if (rangeDays > env.REPORTS_MAX_RANGE_DAYS) {
    throw new ValidationError(
      `Requested date range (${Math.ceil(rangeDays)} days) exceeds the maximum of ${env.REPORTS_MAX_RANGE_DAYS} days`
    );
  }
}

interface ReportScopeFilters {
  regionId?: string;
  zoneId?: string;
  siteId?: string;
  cameraId?: string;
}

function buildCameraWhere(
  scope: ResolvedScope,
  filters: ReportScopeFilters
): Prisma.CameraWhereInput {
  const siteConditions: Prisma.SiteWhereInput[] = [];
  if (filters.siteId) siteConditions.push({ id: filters.siteId });
  if (filters.zoneId) siteConditions.push({ zoneId: filters.zoneId });
  if (filters.regionId) siteConditions.push({ zone: { regionId: filters.regionId } });

  return {
    AND: [
      cameraScopeWhere(scope),
      filters.cameraId ? { id: filters.cameraId } : {},
      siteConditions.length > 0 ? { site: { AND: siteConditions } } : {},
    ],
  };
}

function buildIncidentWhere(
  scope: ResolvedScope,
  filters: ReportScopeFilters & { startDate: Date; endDate: Date; severity?: Severity }
): Prisma.IncidentWhereInput {
  const zoneConditions: Prisma.ZoneWhereInput[] = [zoneScopeWhere(scope)];
  if (filters.regionId) zoneConditions.push({ regionId: filters.regionId });

  return {
    AND: [
      { zone: { AND: zoneConditions } },
      { firstDetectedAt: { gte: filters.startDate, lte: filters.endDate } },
      filters.cameraId ? { cameraId: filters.cameraId } : {},
      filters.siteId ? { siteId: filters.siteId } : {},
      filters.zoneId ? { zoneId: filters.zoneId } : {},
      filters.severity ? { severity: filters.severity } : {},
    ],
  };
}

// ── Uptime report ────────────────────────────────────────────────────────────

export interface UptimeReportRow {
  cameraId: string;
  cameraCode: string;
  cameraName: string;
  siteId: string;
  siteName: string;
  zoneId: string;
  zoneName: string;
  regionId: string;
  regionName: string;
  downtimeSeconds: number;
  uptimePercent: number;
  slaTargetPercent: number;
  slaCompliant: boolean;
}

export interface UptimeReportResult {
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  slaTargetPercent: number;
  summary: {
    cameraCount: number;
    averageUptimePercent: number;
    slaCompliantCount: number;
    slaNonCompliantCount: number;
  };
  rows: UptimeReportRow[];
}

interface IncidentOverlapInput {
  firstDetectedAt: Date;
  resolvedAt: Date | null;
}

/**
 * Seconds of a single incident's [firstDetectedAt, resolvedAt] outage window
 * that actually fall inside [periodStart, periodEnd]. Still-open incidents
 * (`resolvedAt === null`) are treated as ongoing through `now` (clamped to
 * periodEnd) rather than contributing 0 or their eventual (unknown) total —
 * this is why we recompute from the raw timestamps instead of summing the
 * stored `Incident.downtimeSeconds` field, which records the *whole* incident
 * duration and would over-count incidents that started before periodStart.
 */
function clippedDowntimeSeconds(
  incident: IncidentOverlapInput,
  periodStart: Date,
  periodEnd: Date,
  now: Date
): number {
  const outageEndMs = (incident.resolvedAt ?? (now < periodEnd ? now : periodEnd)).getTime();
  const clippedStartMs = Math.max(incident.firstDetectedAt.getTime(), periodStart.getTime());
  const clippedEndMs = Math.min(outageEndMs, periodEnd.getTime());
  return clippedEndMs > clippedStartMs ? (clippedEndMs - clippedStartMs) / 1000 : 0;
}

function sumClippedDowntimeSeconds(
  incidents: IncidentOverlapInput[],
  periodStart: Date,
  periodEnd: Date,
  now: Date
): number {
  let total = 0;
  for (const incident of incidents)
    total += clippedDowntimeSeconds(incident, periodStart, periodEnd, now);
  return Math.round(total);
}

const cameraReportSelect = {
  id: true,
  cameraCode: true,
  name: true,
  site: {
    select: {
      id: true,
      name: true,
      zone: {
        select: {
          id: true,
          name: true,
          region: { select: { id: true, name: true } },
        },
      },
    },
  },
} satisfies Prisma.CameraSelect;

export async function getUptimeReport(
  userId: string,
  query: UptimeReportQuery
): Promise<UptimeReportResult> {
  assertRangeWithinLimit(query.startDate, query.endDate);
  const scope = await getUserScope(userId);

  const cameras = await prisma.camera.findMany({
    where: buildCameraWhere(scope, query),
    select: cameraReportSelect,
    orderBy: { cameraCode: 'asc' },
  });

  const now = new Date();
  const slaTargetPercent = env.REPORTS_SLA_UPTIME_TARGET_PCT;

  if (cameras.length === 0) {
    return {
      generatedAt: now,
      periodStart: query.startDate,
      periodEnd: query.endDate,
      slaTargetPercent,
      summary: {
        cameraCount: 0,
        averageUptimePercent: 100,
        slaCompliantCount: 0,
        slaNonCompliantCount: 0,
      },
      rows: [],
    };
  }

  const cameraIds = cameras.map((c) => c.id);
  const siteIds = [...new Set(cameras.map((c) => c.site.id))];

  // Incidents attributed to a specific camera, PLUS site-wide incidents
  // (INCIDENT_RULES scope: 'SITE', cameraId null — e.g. SITE_INTERNET_DOWN)
  // for any site one of our cameras lives at: a dead router/internet link
  // took every camera at that site down, not just one.
  const incidents = await prisma.incident.findMany({
    where: {
      AND: [
        { OR: [{ resolvedAt: null }, { resolvedAt: { gte: query.startDate } }] },
        { firstDetectedAt: { lte: query.endDate } },
        {
          OR: [{ cameraId: { in: cameraIds } }, { cameraId: null, siteId: { in: siteIds } }],
        },
      ],
    },
    select: { cameraId: true, siteId: true, firstDetectedAt: true, resolvedAt: true },
  });

  const incidentsByCameraId = new Map<string, IncidentOverlapInput[]>();
  const incidentsBySiteId = new Map<string, IncidentOverlapInput[]>();
  for (const incident of incidents) {
    const bucket = incident.cameraId
      ? (incidentsByCameraId.get(incident.cameraId) ?? [])
      : (incidentsBySiteId.get(incident.siteId) ?? []);
    bucket.push({ firstDetectedAt: incident.firstDetectedAt, resolvedAt: incident.resolvedAt });
    if (incident.cameraId) incidentsByCameraId.set(incident.cameraId, bucket);
    else incidentsBySiteId.set(incident.siteId, bucket);
  }

  const rows: UptimeReportRow[] = cameras.map((camera) => {
    const relevant = [
      ...(incidentsByCameraId.get(camera.id) ?? []),
      ...(incidentsBySiteId.get(camera.site.id) ?? []),
    ];
    const downtimeSeconds = sumClippedDowntimeSeconds(
      relevant,
      query.startDate,
      query.endDate,
      now
    );
    const uptimePercentRaw = calculateUptimePercent({
      periodStart: query.startDate,
      periodEnd: query.endDate,
      downtimeSeconds,
    });
    const uptimePercent = Math.round(uptimePercentRaw * 100) / 100;

    return {
      cameraId: camera.id,
      cameraCode: camera.cameraCode,
      cameraName: camera.name,
      siteId: camera.site.id,
      siteName: camera.site.name,
      zoneId: camera.site.zone.id,
      zoneName: camera.site.zone.name,
      regionId: camera.site.zone.region.id,
      regionName: camera.site.zone.region.name,
      downtimeSeconds,
      uptimePercent,
      slaTargetPercent,
      slaCompliant: calculateSlaCompliance(uptimePercent, slaTargetPercent),
    };
  });

  rows.sort((a, b) => a.uptimePercent - b.uptimePercent);

  const slaCompliantCount = rows.filter((r) => r.slaCompliant).length;
  const averageUptimePercent =
    rows.length > 0
      ? Math.round((rows.reduce((sum, r) => sum + r.uptimePercent, 0) / rows.length) * 100) / 100
      : 100;

  return {
    generatedAt: now,
    periodStart: query.startDate,
    periodEnd: query.endDate,
    slaTargetPercent,
    summary: {
      cameraCount: rows.length,
      averageUptimePercent,
      slaCompliantCount,
      slaNonCompliantCount: rows.length - slaCompliantCount,
    },
    rows,
  };
}

// ── Incidents report ─────────────────────────────────────────────────────────

export interface IncidentsReportRow {
  incidentId: string;
  incidentNumber: string;
  cameraId: string | null;
  cameraCode: string | null;
  cameraName: string | null;
  siteId: string;
  siteName: string;
  zoneId: string;
  zoneName: string;
  type: string;
  severity: Severity;
  status: IncidentStatus;
  diagnosis: Diagnosis | null;
  firstDetectedAt: Date;
  lastDetectedAt: Date;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  recoveryVerifiedAt: Date | null;
  closedAt: Date | null;
  downtimeSeconds: number | null;
  rootCause: string | null;
  resolutionNotes: string | null;
}

export interface IncidentsReportResult {
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  summary: {
    totalIncidents: number;
    countsBySeverity: Record<string, number>;
    mttaMinutes: number | null;
    mttrMinutes: number | null;
  };
  rows: IncidentsReportRow[];
}

export async function getIncidentsReport(
  userId: string,
  query: IncidentsReportQuery
): Promise<IncidentsReportResult> {
  assertRangeWithinLimit(query.startDate, query.endDate);
  const scope = await getUserScope(userId);

  const incidents = await prisma.incident.findMany({
    where: buildIncidentWhere(scope, query),
    orderBy: { firstDetectedAt: 'desc' },
    include: {
      camera: { select: { id: true, cameraCode: true, name: true } },
      site: { select: { id: true, name: true } },
      zone: { select: { id: true, name: true } },
    },
  });

  const rows: IncidentsReportRow[] = incidents.map((incident) => ({
    incidentId: incident.id,
    incidentNumber: incident.incidentNumber,
    cameraId: incident.cameraId,
    cameraCode: incident.camera?.cameraCode ?? null,
    cameraName: incident.camera?.name ?? null,
    siteId: incident.siteId,
    siteName: incident.site.name,
    zoneId: incident.zoneId,
    zoneName: incident.zone.name,
    type: incident.type,
    severity: incident.severity,
    status: incident.status,
    diagnosis: incident.diagnosis,
    firstDetectedAt: incident.firstDetectedAt,
    lastDetectedAt: incident.lastDetectedAt,
    acknowledgedAt: incident.acknowledgedAt,
    resolvedAt: incident.resolvedAt,
    recoveryVerifiedAt: incident.recoveryVerifiedAt,
    closedAt: incident.closedAt,
    downtimeSeconds: incident.downtimeSeconds,
    rootCause: incident.rootCause,
    resolutionNotes: incident.resolutionNotes,
  }));

  const mttaMinutes = calculateMTTA(
    incidents.map((i) => ({ firstDetectedAt: i.firstDetectedAt, acknowledgedAt: i.acknowledgedAt }))
  );
  const mttrMinutes = calculateMTTR(
    incidents.map((i) => ({ firstDetectedAt: i.firstDetectedAt, resolvedAt: i.resolvedAt }))
  );
  const countsBySeverity = calculateIncidentCountsBySeverity(incidents);

  return {
    generatedAt: new Date(),
    periodStart: query.startDate,
    periodEnd: query.endDate,
    summary: {
      totalIncidents: incidents.length,
      countsBySeverity,
      mttaMinutes,
      mttrMinutes,
    },
    rows,
  };
}
