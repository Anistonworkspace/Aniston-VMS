import { randomUUID } from 'node:crypto';
import type { Channel, Severity } from '@prisma/client';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// Stage 4 — alert dispatch (docs/02-TRD.md §6.6), mock-first.
// Recipients come from zone_alert_recipients (zone + severity + level).
// Every send is persisted as a Notification row so the alert-delivery
// dashboard shows the full QUEUED → DELIVERED / FAILED trail. In mock mode
// (ALERT_MOCK_MODE=true, the default) messages are logged instead of sent and
// immediately marked DELIVERED with a mock provider id. Real SMTP/WhatsApp
// Cloud API adapters slot into sendViaProvider() post-MVP.
// ─────────────────────────────────────────────────────────────────────────────

export interface AlertContext {
  incidentNumber: string;
  type: string;
  severity: Severity;
  cameraCode?: string | null;
  cameraName?: string | null;
  siteName: string;
  zoneName: string;
  detectedAt: Date;
  detail?: string;
}

export type TemplateName =
  'incident_alert' | 'site_outage' | 'incident_escalation' | 'incident_recovery';

function renderTemplate(
  template: TemplateName,
  ctx: AlertContext
): { subject: string; body: string } {
  const target = ctx.cameraCode
    ? `Camera ${ctx.cameraCode} (${ctx.cameraName ?? 'unnamed'})`
    : `Site ${ctx.siteName}`;
  const when = ctx.detectedAt.toISOString();
  const suffix = ctx.detail ? ` ${ctx.detail}` : '';
  switch (template) {
    case 'site_outage':
      return {
        subject: `[${ctx.severity}] ${ctx.incidentNumber} — Site internet down: ${ctx.siteName}`,
        body: `Router at ${ctx.siteName} (${ctx.zoneName}) is unreachable and its cameras are offline since ${when}.${suffix}`,
      };
    case 'incident_escalation':
      return {
        subject: `[ESCALATION] ${ctx.incidentNumber} unacknowledged — ${target}`,
        body: `${ctx.type} on ${target} at ${ctx.siteName} (${ctx.zoneName}) is open since ${when} with no acknowledgement.${suffix}`,
      };
    case 'incident_recovery':
      return {
        subject: `[RECOVERED] ${ctx.incidentNumber} — ${target} back online`,
        body: `${target} at ${ctx.siteName} (${ctx.zoneName}) recovered and passed verification.${suffix}`,
      };
    default:
      return {
        subject: `[${ctx.severity}] ${ctx.incidentNumber} — ${ctx.type}: ${target}`,
        body: `${ctx.type} detected on ${target} at ${ctx.siteName} (${ctx.zoneName}) at ${when}.${suffix}`,
      };
  }
}

interface SendResult {
  ok: boolean;
  at: Date;
  messageId?: string;
  error?: string;
}

function sendViaProvider(
  channel: Channel,
  recipient: string,
  subject: string,
  body: string
): SendResult {
  const at = new Date();
  if (env.ALERT_MOCK_MODE) {
    const messageId = `mock-${channel.toLowerCase()}-${randomUUID()}`;
    logger.info(`[MOCK ${channel}] alert dispatched`, { recipient, subject, body, messageId });
    return { ok: true, at, messageId };
  }
  // Live providers are post-MVP — fail loudly rather than pretend delivery.
  return { ok: false, at, error: `No live ${channel} provider configured (ALERT_MOCK_MODE=false)` };
}

export interface DispatchInput {
  incidentId: string;
  zoneId: string;
  severity: Severity;
  level: number;
  templateName: TemplateName;
  context: AlertContext;
}

/** Sends to all recipients for the zone/severity/level; returns delivered count. */
export async function dispatchIncidentAlerts(input: DispatchInput): Promise<number> {
  let recipients = await prisma.zoneAlertRecipient.findMany({
    where: { zoneId: input.zoneId, escalationLevel: input.level, severity: input.severity },
  });
  if (recipients.length === 0) {
    // Zone may only configure rows for one severity — take any at this level.
    recipients = await prisma.zoneAlertRecipient.findMany({
      where: { zoneId: input.zoneId, escalationLevel: input.level },
    });
  }
  if (recipients.length === 0 && input.level > 1) {
    // Ladder level not configured yet — repeat to level 1 so pages keep firing.
    recipients = await prisma.zoneAlertRecipient.findMany({
      where: { zoneId: input.zoneId, escalationLevel: 1 },
    });
  }
  if (recipients.length === 0) {
    logger.warn('No alert recipients configured for zone', {
      zoneId: input.zoneId,
      level: input.level,
      severity: input.severity,
    });
    return 0;
  }

  const { subject, body } = renderTemplate(input.templateName, input.context);
  let delivered = 0;
  for (const r of recipients) {
    // Sequential on purpose: keeps the QUEUED→sent trail ordered per recipient.
    const row = await prisma.notification.create({
      data: {
        incidentId: input.incidentId,
        channel: r.channel,
        recipient: r.recipient,
        templateName: input.templateName,
        status: 'QUEUED',
      },
    });
    const result = sendViaProvider(r.channel, r.recipient, subject, body);
    await prisma.notification.update({
      where: { id: row.id },
      data: result.ok
        ? {
            status: 'DELIVERED',
            attemptCount: 1,
            sentAt: result.at,
            deliveredAt: result.at,
            providerMessageId: result.messageId,
          }
        : {
            status: 'FAILED',
            attemptCount: 1,
            failedAt: result.at,
            failureReason: result.error,
          },
    });
    if (result.ok) delivered += 1;
  }
  return delivered;
}
