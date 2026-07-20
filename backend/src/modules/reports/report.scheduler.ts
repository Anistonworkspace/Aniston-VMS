import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { registerRepeatableTick, unregisterRepeatableTick } from '../../lib/scheduler.queue.js';
import { getIncidentsReport, getUptimeReport } from './reports.service.js';
import { buildIncidentsWorkbook, buildUptimeWorkbook } from './reports.export.js';

// ─────────────────────────────────────────────────────────────────────────────
// CR-12 — recurring scheduled-report email delivery job
// (docs/06-implementation-plan.md §CR-12: "recurring scheduled-report email
// delivery job exists and runs (mock transport OK)").
//
// Daily BullMQ repeatable cron tick (REPORT_EMAIL_CRON, default 02:30 UTC =
// 08:00 IST) that renders the last-24 h uptime + incidents workbooks through
// the same reports.service/reports.export code paths the UI uses, then
// "delivers" them via the mock transport: attachments + a message.json
// envelope land in `${UPLOAD_DIR}/reports-outbox/<yyyy-mm-dd>/`. A real SMTP
// transport (SMTP_* envs already exist in config/env.ts) is a drop-in
// replacement for deliverMock() — Phase-2, mirroring ALERT_MOCK_MODE.
// ─────────────────────────────────────────────────────────────────────────────

const TICK_NAME = 'report-scheduler';

export interface ReportEmailEnvelope {
  to: string;
  from: string;
  subject: string;
  bodyText: string;
  attachments: { filename: string; bytes: number }[];
  transport: 'mock' | 'smtp';
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
}

export interface EnvelopeInput {
  now: Date;
  periodStart: Date;
  periodEnd: Date;
  to: string;
  from: string;
  smtpConfigured: boolean;
  uptime: { cameraCount: number; averageUptimePercent: number; slaNonCompliantCount: number };
  incidents: { totalIncidents: number; countsBySeverity: Record<string, number> };
  attachments: { filename: string; bytes: number }[];
}

/** Pure envelope builder — unit-tested without touching prisma/fs. */
export function buildReportEmailEnvelope(input: EnvelopeInput): ReportEmailEnvelope {
  const day = input.now.toISOString().slice(0, 10);
  const sev = Object.entries(input.incidents.countsBySeverity)
    .map(([k, v]) => `${k}:${v}`)
    .join(' ');
  return {
    to: input.to,
    from: input.from,
    subject: `[Aniston VMS] Daily ops report ${day} — avg uptime ${input.uptime.averageUptimePercent.toFixed(2)}% across ${input.uptime.cameraCount} cameras, ${input.incidents.totalIncidents} incidents`,
    bodyText: [
      `Reporting window: ${input.periodStart.toISOString()} → ${input.periodEnd.toISOString()}`,
      `Cameras: ${input.uptime.cameraCount} (SLA breaches: ${input.uptime.slaNonCompliantCount})`,
      `Incidents: ${input.incidents.totalIncidents}${sev ? ` (${sev})` : ''}`,
      `Attachments: ${input.attachments.map((a) => a.filename).join(', ') || 'none'}`,
    ].join('\n'),
    attachments: input.attachments,
    transport: input.smtpConfigured ? 'smtp' : 'mock',
    generatedAt: input.now.toISOString(),
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
  };
}

/**
 * One full delivery pass — exported so drills/tests can invoke it directly
 * (the cron tick just calls this). Resolves to the outbox dir (or null when
 * skipped because no SUPER_ADMIN exists to scope the report as).
 */
export async function runScheduledReportDelivery(now = new Date()): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true },
  });
  if (!admin) {
    logger.warn('Report scheduler: no SUPER_ADMIN user — skipping delivery');
    return null;
  }

  const periodEnd = now;
  const periodStart = new Date(now.getTime() - 24 * 3_600_000);
  const query = { startDate: periodStart, endDate: periodEnd };

  const uptime = await getUptimeReport(admin.id, query);
  const incidents = await getIncidentsReport(admin.id, query);
  const uptimeXlsx = await buildUptimeWorkbook(uptime.rows);
  const incidentsXlsx = await buildIncidentsWorkbook(incidents.rows);

  const day = now.toISOString().slice(0, 10);
  const outboxDir = path.resolve(env.UPLOAD_DIR, 'reports-outbox', day);
  await fs.mkdir(outboxDir, { recursive: true });

  const files: { filename: string; buffer: Buffer }[] = [
    { filename: `uptime-${day}.xlsx`, buffer: uptimeXlsx },
    { filename: `incidents-${day}.xlsx`, buffer: incidentsXlsx },
  ];
  for (const f of files) {
    await fs.writeFile(path.join(outboxDir, f.filename), f.buffer);
  }

  const envelope = buildReportEmailEnvelope({
    now,
    periodStart,
    periodEnd,
    to: env.REPORT_EMAIL_TO,
    from: env.SMTP_FROM ?? 'vms-reports@anistonvms.example',
    smtpConfigured: Boolean(env.SMTP_HOST),
    uptime: uptime.summary,
    incidents: incidents.summary,
    attachments: files.map((f) => ({ filename: f.filename, bytes: f.buffer.length })),
  });
  await fs.writeFile(path.join(outboxDir, 'message.json'), JSON.stringify(envelope, null, 2));

  logger.info('Scheduled report delivered', {
    transport: envelope.transport,
    to: envelope.to,
    outboxDir,
    cameras: uptime.summary.cameraCount,
    incidents: incidents.summary.totalIncidents,
  });
  return outboxDir;
}

let registered = false;

export function startReportScheduler(): void {
  if (registered) return;
  registered = true;
  void registerRepeatableTick(TICK_NAME, { pattern: env.REPORT_EMAIL_CRON }, async () => {
    await runScheduledReportDelivery().catch((err: unknown) =>
      logger.error('Scheduled report delivery failed', { error: String(err) })
    );
  }).catch((err: unknown) =>
    logger.error('Report scheduler registration failed', { error: String(err) })
  );
  logger.info('Report scheduler started', {
    cron: env.REPORT_EMAIL_CRON,
    to: env.REPORT_EMAIL_TO,
    transport: env.SMTP_HOST ? 'smtp' : 'mock',
  });
}

export function stopReportScheduler(): void {
  registered = false;
  unregisterRepeatableTick(TICK_NAME);
}
