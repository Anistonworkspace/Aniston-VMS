import { describe, expect, it } from 'vitest';
import { buildReportEmailEnvelope } from './report.scheduler.js';

// CR-12 — scheduled-report email job: pure envelope composition (delivery IO
// is exercised by the live stack; see runScheduledReportDelivery).

const base = {
  now: new Date('2026-07-18T02:30:00.000Z'),
  periodStart: new Date('2026-07-17T02:30:00.000Z'),
  periodEnd: new Date('2026-07-18T02:30:00.000Z'),
  to: 'ops@anistonvms.example',
  from: 'vms-reports@anistonvms.example',
  smtpConfigured: false,
  uptime: { cameraCount: 125, averageUptimePercent: 99.62, slaNonCompliantCount: 3 },
  incidents: { totalIncidents: 7, countsBySeverity: { CRITICAL: 2, WARNING: 5 } },
  attachments: [
    { filename: 'uptime-2026-07-18.xlsx', bytes: 20_480 },
    { filename: 'incidents-2026-07-18.xlsx', bytes: 18_944 },
  ],
};

describe('buildReportEmailEnvelope', () => {
  it('composes a dated subject with uptime + incident rollups', () => {
    const env = buildReportEmailEnvelope(base);
    expect(env.subject).toBe(
      '[Aniston VMS] Daily ops report 2026-07-18 — avg uptime 99.62% across 125 cameras, 7 incidents'
    );
    expect(env.to).toBe('ops@anistonvms.example');
    expect(env.generatedAt).toBe('2026-07-18T02:30:00.000Z');
  });

  it('body lists window, SLA breaches, severity counts and attachments', () => {
    const env = buildReportEmailEnvelope(base);
    expect(env.bodyText).toContain('2026-07-17T02:30:00.000Z → 2026-07-18T02:30:00.000Z');
    expect(env.bodyText).toContain('SLA breaches: 3');
    expect(env.bodyText).toContain('CRITICAL:2 WARNING:5');
    expect(env.bodyText).toContain('uptime-2026-07-18.xlsx, incidents-2026-07-18.xlsx');
  });

  it('selects mock transport without SMTP and smtp when configured', () => {
    expect(buildReportEmailEnvelope(base).transport).toBe('mock');
    expect(buildReportEmailEnvelope({ ...base, smtpConfigured: true }).transport).toBe('smtp');
  });

  it('handles an empty period gracefully', () => {
    const env = buildReportEmailEnvelope({
      ...base,
      uptime: { cameraCount: 0, averageUptimePercent: 0, slaNonCompliantCount: 0 },
      incidents: { totalIncidents: 0, countsBySeverity: {} },
      attachments: [],
    });
    expect(env.subject).toContain('avg uptime 0.00% across 0 cameras, 0 incidents');
    expect(env.bodyText).toContain('Attachments: none');
  });
});
