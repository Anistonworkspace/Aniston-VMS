import type { Diagnosis, Incident, IncidentStatus, Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { logger } from '../../lib/logger.js';
import { getUserScope, zoneScopeWhere } from '../../lib/scope.js';
import { auditWithinTx } from '../../lib/audit.js';
import { ConflictError, NotFoundError, ValidationError } from '../../middleware/errorHandler.js';
import { INCIDENT_RULES, type IncidentRule, OPEN_STATUS_LIST } from './incident.constants.js';
import { type AlertContext, dispatchIncidentAlerts } from './notification.service.js';
import { emitToZone } from '../../lib/realtime.js';

// ─────────────────────────────────────────────────────────────────────────────
// Stage 4 — incident engine (docs/02-TRD.md §6.5).
// Fed by the health scheduler after every camera check. Responsibilities:
//   confirm    — N consecutive fails (or stale lastHealthyAt / immediate rules)
//   suppress   — maintenance mode/windows, site-outage dependency suppression
//   dedup      — one open incident per camera+type (site+type for SITE scope)
//   alert      — level-1 recipients on creation (escalation.worker climbs)
//   recover    — M consecutive healthy checks auto-resolve + verify + notify
// Lifecycle mutations (ack/assign/investigate/resolve/close) power the Kanban.
// Every transition lands in incident_events — the timeline is append-only.
// ─────────────────────────────────────────────────────────────────────────────

const FAIL_KEY = (cameraId: string): string => `incident:fails:${cameraId}`;
const OK_KEY = (cameraId: string): string => `incident:oks:${cameraId}`;
const COUNTER_TTL_SECONDS = 24 * 3600;

export interface HealthOutcomeInput {
  camera: {
    id: string;
    siteId: string;
    cameraCode: string;
    name: string;
    maintenanceMode: boolean;
    lastHealthyAt: Date | null;
  };
  allHealthy: boolean;
  diagnosis: Diagnosis | null;
  healthScore: number;
  at: Date;
}

/** Health-scheduler hook — must never throw into the health loop (caller guards too). */
export async function onHealthOutcome(input: HealthOutcomeInput): Promise<void> {
  if (!env.INCIDENT_ENGINE_ENABLED) return;
  const { camera, at } = input;

  if (input.allHealthy) {
    await redis.del(FAIL_KEY(camera.id));
    const oks = await redis.incr(OK_KEY(camera.id));
    await redis.expire(OK_KEY(camera.id), COUNTER_TTL_SECONDS);
    if (oks >= env.INCIDENT_RECOVERY_CHECKS) {
      await resolveRecovered(camera.id, camera.siteId, at);
    }
    return;
  }

  await redis.del(OK_KEY(camera.id));
  const fails = await redis.incr(FAIL_KEY(camera.id));
  await redis.expire(FAIL_KEY(camera.id), COUNTER_TTL_SECONDS);

  const diagnosis = input.diagnosis;
  if (!diagnosis) return; // unhealthy but nothing actionable to page on
  const rule = INCIDENT_RULES[diagnosis];

  // Confirmation gate: immediate rules skip the streak; the rest need
  // N consecutive fails OR ≥2 fails with lastHealthyAt older than the
  // offline window (docs §6.5: "3 consecutive failures or 5 min offline").
  const offlineMs = camera.lastHealthyAt ? at.getTime() - camera.lastHealthyAt.getTime() : null;
  const offlineLongEnough =
    fails >= 2 && offlineMs !== null && offlineMs >= env.INCIDENT_OFFLINE_MINUTES * 60_000;
  if (!rule.immediate && fails < env.INCIDENT_CONSECUTIVE_FAILS && !offlineLongEnough) return;

  // Maintenance suppression: flagged cameras or an approved window mute
  // alerting — the fault stays visible on the health dashboard regardless.
  if (camera.maintenanceMode || (await inMaintenanceWindow(camera.id, camera.siteId, at))) {
    return;
  }

  // Dependency suppression: while the site's internet is down, individual
  // camera faults at that site are symptoms, not separate incidents.
  if (rule.scope === 'CAMERA') {
    const siteOutage = await prisma.incident.findFirst({
      where: {
        siteId: camera.siteId,
        cameraId: null,
        type: 'SITE_INTERNET_DOWN',
        status: { in: OPEN_STATUS_LIST },
      },
      select: { id: true },
    });
    if (siteOutage) return;
  }

  // Dedup: refresh the existing open incident instead of creating a twin.
  const dedupWhere: Prisma.IncidentWhereInput =
    rule.scope === 'SITE'
      ? { siteId: camera.siteId, cameraId: null, type: diagnosis, status: { in: OPEN_STATUS_LIST } }
      : { cameraId: camera.id, type: diagnosis, status: { in: OPEN_STATUS_LIST } };
  const existing = await prisma.incident.findFirst({ where: dedupWhere, select: { id: true } });
  if (existing) {
    await prisma.incident.update({ where: { id: existing.id }, data: { lastDetectedAt: at } });
    return;
  }

  await createIncident(camera, diagnosis, rule, fails, at, input.healthScore);
}

async function inMaintenanceWindow(cameraId: string, siteId: string, at: Date): Promise<boolean> {
  const win = await prisma.maintenanceWindow.findFirst({
    where: { startAt: { lte: at }, endAt: { gte: at }, OR: [{ cameraId }, { siteId }] },
    select: { id: true },
  });
  return win !== null;
}

// Incident numbers are "ANI-CAM-YYYY-NNNNNN", sequential per year. The unique
// index on incident_number is the arbiter — on a concurrent clash we retry.
async function nextIncidentNumber(tx: Prisma.TransactionClient, at: Date): Promise<string> {
  const prefix = `ANI-CAM-${at.getFullYear()}-`;
  const count = await tx.incident.count({ where: { incidentNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(6, '0')}`;
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'P2002';
}

async function createIncident(
  camera: HealthOutcomeInput['camera'],
  diagnosis: Diagnosis,
  rule: IncidentRule,
  consecutiveFailures: number,
  at: Date,
  healthScore: number
): Promise<void> {
  const site = await prisma.site.findUniqueOrThrow({
    where: { id: camera.siteId },
    select: { id: true, name: true, zoneId: true, zone: { select: { name: true } } },
  });
  // Evidence pack (§6.5): link the last good snapshot as "before" proof.
  // The fault snapshot stays null here — the camera is unreachable at this
  // moment; the snapshot engine attaches one if a later capture succeeds.
  const previousSnapshot =
    rule.scope === 'CAMERA'
      ? await prisma.snapshot.findFirst({
          where: { cameraId: camera.id },
          orderBy: { capturedAt: 'desc' },
          select: { id: true },
        })
      : null;

  let incident: Incident | null = null;
  for (let attempt = 0; attempt < 3 && !incident; attempt += 1) {
    try {
      incident = await prisma.$transaction(async (tx) => {
        const incidentNumber = await nextIncidentNumber(tx, at);
        const created = await tx.incident.create({
          data: {
            incidentNumber,
            cameraId: rule.scope === 'CAMERA' ? camera.id : null,
            siteId: site.id,
            zoneId: site.zoneId,
            type: diagnosis,
            severity: rule.severity,
            status: 'CONFIRMED',
            diagnosis,
            firstDetectedAt: at,
            lastDetectedAt: at,
            previousSnapshotId: previousSnapshot?.id ?? null,
            slaImpact: rule.severity === 'CRITICAL',
          },
        });
        await tx.incidentEvent.createMany({
          data: [
            {
              incidentId: created.id,
              actor: 'system',
              event: 'DETECTED',
              detail: { diagnosis, consecutiveFailures, healthScore },
            },
            {
              incidentId: created.id,
              actor: 'system',
              event: 'CONFIRMED',
              detail: { scope: rule.scope, immediate: rule.immediate },
            },
          ],
        });
        return created;
      });
    } catch (err) {
      if (attempt === 2 || !isUniqueViolation(err)) throw err;
    }
  }
  if (!incident) return;

  logger.warn('Incident created', {
    incidentNumber: incident.incidentNumber,
    type: diagnosis,
    severity: rule.severity,
    cameraCode: rule.scope === 'CAMERA' ? camera.cameraCode : null,
    site: site.name,
  });

  const context: AlertContext = {
    incidentNumber: incident.incidentNumber,
    type: diagnosis,
    severity: rule.severity,
    cameraCode: rule.scope === 'CAMERA' ? camera.cameraCode : null,
    cameraName: rule.scope === 'CAMERA' ? camera.name : null,
    siteName: site.name,
    zoneName: site.zone.name,
    detectedAt: at,
    detail: rule.title,
  };
  const delivered = await dispatchIncidentAlerts({
    incidentId: incident.id,
    zoneId: site.zoneId,
    severity: rule.severity,
    level: 1,
    templateName: rule.scope === 'SITE' ? 'site_outage' : 'incident_alert',
    context,
  });
  await prisma.$transaction([
    prisma.incident.update({ where: { id: incident.id }, data: { status: 'ALERTED' } }),
    prisma.incidentEvent.create({
      data: {
        incidentId: incident.id,
        actor: 'system',
        event: 'ALERTED',
        detail: { level: 1, notifications: delivered },
      },
    }),
  ]);
  emitToZone(site.zoneId, 'incident:created', {
    id: incident.id,
    incidentNumber: incident.incidentNumber,
    status: 'ALERTED',
    severity: rule.severity,
    type: diagnosis,
    zoneId: site.zoneId,
    siteId: site.id,
    cameraId: rule.scope === 'CAMERA' ? camera.id : null,
  });
}

// Recovery (§6.5): after M consecutive healthy checks, auto-resolve every open
// incident for the camera — plus site-level incidents for its site, since a
// healthy check proves the router/internet path works again.
async function resolveRecovered(cameraId: string, siteId: string, at: Date): Promise<void> {
  const open = await prisma.incident.findMany({
    where: {
      status: { in: OPEN_STATUS_LIST },
      OR: [{ cameraId }, { siteId, cameraId: null }],
    },
    include: {
      camera: { select: { cameraCode: true, name: true } },
      site: { select: { name: true } },
      zone: { select: { name: true } },
    },
  });
  if (open.length === 0) return;

  for (const inc of open) {
    const downtimeSeconds = Math.max(
      0,
      Math.round((at.getTime() - inc.firstDetectedAt.getTime()) / 1000)
    );
    await prisma.$transaction([
      prisma.incident.update({
        where: { id: inc.id },
        data: {
          status: 'RECOVERY_VERIFIED',
          resolvedAt: at,
          recoveryVerifiedAt: at,
          downtimeSeconds,
          resolutionNotes:
            inc.resolutionNotes ??
            `Auto-recovered after ${env.INCIDENT_RECOVERY_CHECKS} consecutive healthy checks.`,
        },
      }),
      prisma.incidentEvent.createMany({
        data: [
          {
            incidentId: inc.id,
            actor: 'system',
            event: 'RESOLVED',
            detail: { auto: true, downtimeSeconds },
          },
          {
            incidentId: inc.id,
            actor: 'system',
            event: 'RECOVERY_VERIFIED',
            detail: { healthyChecks: env.INCIDENT_RECOVERY_CHECKS },
          },
        ],
      }),
    ]);
    logger.info('Incident auto-recovered', {
      incidentNumber: inc.incidentNumber,
      downtimeSeconds,
    });
    emitToZone(inc.zoneId, 'incident:updated', {
      id: inc.id,
      incidentNumber: inc.incidentNumber,
      status: 'RECOVERY_VERIFIED',
      severity: inc.severity,
      zoneId: inc.zoneId,
    });
    await dispatchIncidentAlerts({
      incidentId: inc.id,
      zoneId: inc.zoneId,
      severity: inc.severity,
      level: 1,
      templateName: 'incident_recovery',
      context: {
        incidentNumber: inc.incidentNumber,
        type: inc.type,
        severity: inc.severity,
        cameraCode: inc.camera?.cameraCode ?? null,
        cameraName: inc.camera?.name ?? null,
        siteName: inc.site.name,
        zoneName: inc.zone.name,
        detectedAt: inc.firstDetectedAt,
        detail: `Downtime ${Math.round(downtimeSeconds / 60)} min.`,
      },
    });
  }
}

// ── Lifecycle mutations (Kanban) ─────────────────────────────────────────────

type ActorUser = { id: string; email: string };

async function mustGetOpen(id: string): Promise<Incident> {
  const inc = await prisma.incident.findUnique({ where: { id } });
  if (!inc) throw new NotFoundError('Incident not found');
  if (!OPEN_STATUS_LIST.includes(inc.status)) {
    throw new ConflictError(`Incident is ${inc.status} — no further changes allowed`);
  }
  return inc;
}

// Kanban board / detail drawer live update — cheap no-op when realtime is off.
function emitIncidentUpdate(inc: Incident): void {
  emitToZone(inc.zoneId, 'incident:updated', {
    id: inc.id,
    incidentNumber: inc.incidentNumber,
    status: inc.status,
    severity: inc.severity,
    zoneId: inc.zoneId,
  });
}

export async function ackIncident(id: string, user: ActorUser): Promise<Incident> {
  const inc = await mustGetOpen(id);
  if (inc.acknowledgedAt) throw new ConflictError('Incident already acknowledged');
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.incident.update({
      where: { id },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date(), acknowledgedBy: user.id },
    });
    await tx.incidentEvent.create({
      data: { incidentId: id, actor: user.email, event: 'ACKNOWLEDGED' },
    });
    await auditWithinTx(tx, {
      userId: user.id,
      action: 'incident.acknowledge',
      entityType: 'incident',
      entityId: id,
      siteId: inc.siteId,
      zoneId: inc.zoneId,
      oldValue: { status: inc.status },
      newValue: { status: u.status },
    });
    return u;
  });
  emitIncidentUpdate(updated);
  return updated;
}

export async function assignIncident(
  id: string,
  assignedToId: string,
  user: ActorUser
): Promise<Incident> {
  const inc = await mustGetOpen(id);
  const assignee = await prisma.user.findUnique({
    where: { id: assignedToId },
    select: { id: true, email: true },
  });
  if (!assignee) throw new ValidationError('Assignee not found');
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.incident.update({
      where: { id },
      data: {
        status: 'ASSIGNED',
        assignedToId,
        // Assigning implies the pager was heard — ack if nobody did yet.
        ...(inc.acknowledgedAt ? {} : { acknowledgedAt: now, acknowledgedBy: user.id }),
      },
    });
    await tx.incidentEvent.create({
      data: {
        incidentId: id,
        actor: user.email,
        event: 'ASSIGNED',
        detail: { assignee: assignee.email },
      },
    });
    await auditWithinTx(tx, {
      userId: user.id,
      action: 'incident.assign',
      entityType: 'incident',
      entityId: id,
      siteId: inc.siteId,
      zoneId: inc.zoneId,
      oldValue: { status: inc.status, assignedToId: inc.assignedToId },
      newValue: { status: u.status, assignedToId },
    });
    return u;
  });
  emitIncidentUpdate(updated);
  return updated;
}

export async function markInvestigating(id: string, user: ActorUser): Promise<Incident> {
  const inc = await mustGetOpen(id);
  if (inc.status !== 'ACKNOWLEDGED' && inc.status !== 'ASSIGNED') {
    throw new ConflictError(`Cannot start investigating from ${inc.status}`);
  }
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.incident.update({ where: { id }, data: { status: 'INVESTIGATING' } });
    await tx.incidentEvent.create({
      data: { incidentId: id, actor: user.email, event: 'INVESTIGATING' },
    });
    await auditWithinTx(tx, {
      userId: user.id,
      action: 'incident.investigate',
      entityType: 'incident',
      entityId: id,
      siteId: inc.siteId,
      zoneId: inc.zoneId,
      oldValue: { status: inc.status },
      newValue: { status: u.status },
    });
    return u;
  });
  emitIncidentUpdate(updated);
  return updated;
}

export interface ResolveInput {
  rootCause: string;
  resolutionNotes: string;
  correctiveAction?: string;
  spareParts?: string;
}

export async function resolveIncident(
  id: string,
  input: ResolveInput,
  user: ActorUser
): Promise<Incident> {
  const inc = await mustGetOpen(id);
  const now = new Date();
  const downtimeSeconds = Math.max(
    0,
    Math.round((now.getTime() - inc.firstDetectedAt.getTime()) / 1000)
  );
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.incident.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedAt: now,
        downtimeSeconds,
        rootCause: input.rootCause,
        resolutionNotes: input.resolutionNotes,
        correctiveAction: input.correctiveAction ?? null,
        spareParts: input.spareParts ?? null,
      },
    });
    await tx.incidentEvent.create({
      data: {
        incidentId: id,
        actor: user.email,
        event: 'RESOLVED',
        detail: { auto: false, downtimeSeconds, rootCause: input.rootCause },
      },
    });
    await auditWithinTx(tx, {
      userId: user.id,
      action: 'incident.resolve',
      entityType: 'incident',
      entityId: id,
      siteId: inc.siteId,
      zoneId: inc.zoneId,
      oldValue: { status: inc.status },
      newValue: { status: u.status, downtimeSeconds, rootCause: input.rootCause },
    });
    return u;
  });
  emitIncidentUpdate(updated);
  return updated;
}

export async function closeIncident(id: string, user: ActorUser): Promise<Incident> {
  const inc = await prisma.incident.findUnique({ where: { id } });
  if (!inc) throw new NotFoundError('Incident not found');
  if (inc.status !== 'RESOLVED' && inc.status !== 'RECOVERY_VERIFIED') {
    throw new ConflictError(`Only resolved incidents can be closed (current: ${inc.status})`);
  }
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.incident.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    await tx.incidentEvent.create({ data: { incidentId: id, actor: user.email, event: 'CLOSED' } });
    await auditWithinTx(tx, {
      userId: user.id,
      action: 'incident.close',
      entityType: 'incident',
      entityId: id,
      siteId: inc.siteId,
      zoneId: inc.zoneId,
      oldValue: { status: inc.status },
      newValue: { status: u.status },
    });
    return u;
  });
  emitIncidentUpdate(updated);
  return updated;
}

// ── Scoped queries (Kanban board, detail drawer, alert-delivery log) ─────────

export interface IncidentListFilters {
  status?: IncidentStatus;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  zoneId?: string;
  cameraId?: string;
  /** CR-7 — inclusive lower bound on lastDetectedAt. */
  from?: Date;
  /** CR-7 — exclusive upper bound on lastDetectedAt. */
  to?: Date;
  limit?: number;
}

const listInclude = {
  camera: { select: { id: true, cameraCode: true, name: true } },
  site: { select: { id: true, name: true } },
  zone: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, email: true } },
} satisfies Prisma.IncidentInclude;

export async function listIncidents(userId: string, filters: IncidentListFilters) {
  const scope = await getUserScope(userId);
  const where: Prisma.IncidentWhereInput = {
    zone: zoneScopeWhere(scope),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.severity ? { severity: filters.severity } : {}),
    ...(filters.zoneId ? { zoneId: filters.zoneId } : {}),
    ...(filters.cameraId ? { cameraId: filters.cameraId } : {}),
    ...(filters.from || filters.to
      ? {
          lastDetectedAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lt: filters.to } : {}),
          },
        }
      : {}),
  };
  return prisma.incident.findMany({
    where,
    orderBy: { lastDetectedAt: 'desc' },
    take: filters.limit ?? 50,
    include: listInclude,
  });
}

export async function listRecentIncidents(userId: string, limit = 10) {
  const scope = await getUserScope(userId);
  return prisma.incident.findMany({
    where: { zone: zoneScopeWhere(scope), status: { in: OPEN_STATUS_LIST } },
    orderBy: { lastDetectedAt: 'desc' },
    take: limit,
    include: listInclude,
  });
}

/**
 * CR-7 — stats strip for the dense incidents list view:
 *  - open incident counts grouped by severity (scoped)
 *  - MTTA today: mean firstDetectedAt→acknowledgedAt over incidents
 *    acknowledged since local midnight (null when none).
 */
export async function getIncidentStats(userId: string): Promise<{
  openBySeverity: Record<string, number>;
  mttaTodaySeconds: number | null;
  ackedToday: number;
}> {
  const scope = await getUserScope(userId);
  const zone = zoneScopeWhere(scope);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [severityRows, ackedRows] = await Promise.all([
    prisma.incident.groupBy({
      by: ['severity'],
      _count: { _all: true },
      where: { zone, status: { in: OPEN_STATUS_LIST } },
    }),
    prisma.incident.findMany({
      where: { zone, acknowledgedAt: { gte: startOfToday } },
      select: { firstDetectedAt: true, acknowledgedAt: true },
    }),
  ]);

  const openBySeverity: Record<string, number> = { CRITICAL: 0, WARNING: 0, INFO: 0 };
  for (const row of severityRows) openBySeverity[row.severity] = row._count._all;

  let mttaTodaySeconds: number | null = null;
  if (ackedRows.length > 0) {
    const totalMs = ackedRows.reduce(
      (sum, r) => sum + ((r.acknowledgedAt as Date).getTime() - r.firstDetectedAt.getTime()),
      0
    );
    mttaTodaySeconds = Math.round(totalMs / ackedRows.length / 1000);
  }

  return { openBySeverity, mttaTodaySeconds, ackedToday: ackedRows.length };
}

export async function getIncidentSummary(userId: string): Promise<Record<string, number>> {
  const scope = await getUserScope(userId);
  const rows = await prisma.incident.groupBy({
    by: ['status'],
    _count: { _all: true },
    where: { zone: zoneScopeWhere(scope) },
  });
  const summary: Record<string, number> = {};
  for (const row of rows) summary[row.status] = row._count._all;
  return summary;
}

export async function getIncidentDetail(userId: string, id: string) {
  const scope = await getUserScope(userId);
  const incident = await prisma.incident.findFirst({
    where: { id, zone: zoneScopeWhere(scope) },
    include: {
      ...listInclude,
      previousSnapshot: { select: { id: true, capturedAt: true } },
      faultSnapshot: { select: { id: true, capturedAt: true } },
      events: { orderBy: { createdAt: 'asc' } },
      notifications: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!incident) throw new NotFoundError('Incident not found');
  return incident;
}

export async function listAlertDeliveries(userId: string, limit = 100) {
  const scope = await getUserScope(userId);
  return prisma.notification.findMany({
    where: { incident: { zone: zoneScopeWhere(scope) } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      incident: {
        select: { id: true, incidentNumber: true, severity: true, type: true },
      },
    },
  });
}
