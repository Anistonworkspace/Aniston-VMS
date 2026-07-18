import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { ESCALATION_LADDER } from './incident.constants.js';
import { dispatchIncidentAlerts } from './notification.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// Stage 4 — escalation worker (docs/02-TRD.md §6.5).
// Every tick, unacknowledged CRITICAL incidents climb the recipient ladder
// (10/20/30/60 min → escalation_level 2..5). Fired levels are recorded as
// ESCALATED events, which double as the dedup guard across restarts.
// Acknowledging pauses the climb; only verified recovery closes the fault.
// ─────────────────────────────────────────────────────────────────────────────

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startEscalationWorker(): void {
  if (timer) return;
  logger.info('Escalation worker started', {
    intervalSeconds: env.ESCALATION_INTERVAL_SECONDS,
    ladder: ESCALATION_LADDER.map((s) => `${s.afterMinutes}m→L${s.level}`).join(' '),
  });
  timer = setInterval(() => void escalationTick(), env.ESCALATION_INTERVAL_SECONDS * 1000);
  void escalationTick();
}

export function stopEscalationWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export async function escalationTick(): Promise<void> {
  if (running) return; // don't overlap slow ticks
  running = true;
  try {
    const now = Date.now();
    const open = await prisma.incident.findMany({
      where: {
        severity: 'CRITICAL',
        acknowledgedAt: null,
        resolvedAt: null,
        status: { in: ['CONFIRMED', 'ALERTED'] },
      },
      include: {
        camera: { select: { cameraCode: true, name: true } },
        site: { select: { name: true } },
        zone: { select: { name: true } },
      },
    });

    for (const inc of open) {
      const ageMinutes = Math.floor((now - inc.firstDetectedAt.getTime()) / 60_000);
      const due = ESCALATION_LADDER.filter((s) => ageMinutes >= s.afterMinutes);
      if (due.length === 0) continue;

      const fired = await prisma.incidentEvent.findMany({
        where: { incidentId: inc.id, event: 'ESCALATED' },
        select: { detail: true },
      });
      const firedLevels = new Set(fired.map((e) => (e.detail as { level?: number } | null)?.level));

      for (const step of due) {
        if (firedLevels.has(step.level)) continue;
        const delivered = await dispatchIncidentAlerts({
          incidentId: inc.id,
          zoneId: inc.zoneId,
          severity: inc.severity,
          level: step.level,
          templateName: 'incident_escalation',
          context: {
            incidentNumber: inc.incidentNumber,
            type: inc.type,
            severity: inc.severity,
            cameraCode: inc.camera?.cameraCode ?? null,
            cameraName: inc.camera?.name ?? null,
            siteName: inc.site.name,
            zoneName: inc.zone.name,
            detectedAt: inc.firstDetectedAt,
            detail: `Escalation level ${step.level} — unacknowledged for ${step.afterMinutes} min.`,
          },
        });
        await prisma.incidentEvent.create({
          data: {
            incidentId: inc.id,
            actor: 'system',
            event: 'ESCALATED',
            detail: {
              level: step.level,
              afterMinutes: step.afterMinutes,
              notifications: delivered,
            },
          },
        });
        logger.warn('Incident escalated', {
          incidentNumber: inc.incidentNumber,
          level: step.level,
          ageMinutes,
        });
      }
    }
  } catch (err) {
    logger.error('Escalation tick failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    running = false;
  }
}
