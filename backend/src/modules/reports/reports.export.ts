// exceljs is CommonJS — a named `import { Workbook }` compiles fine under tsx
// (which interops CJS named exports) but crashes plain Node ESM at runtime
// ("Named export 'Workbook' not found"). Default-import + destructure instead.
import ExcelJS from 'exceljs';

const { Workbook } = ExcelJS;
import PDFDocument from 'pdfkit';
import { calculateIncidentCountsBySeverity } from './reports.calc.js';
import type { UptimeReportRow, IncidentsReportRow } from './reports.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// File builders for the reporting module. Kept separate from reports.service.ts
// (which only fetches/shapes data) and reports.router.ts (which only wires
// HTTP + storage + audit) so each file has exactly one job. Every builder
// returns a `Promise<Buffer>` — the xlsx ones resolve synchronously-ish via
// exceljs's own `workbook.xlsx.writeBuffer()`, the pdf ones via a Promise
// wrapped around pdfkit's streaming `data`/`end` events — so the router can
// treat all four identically: `const buffer = await BUILDER(rows);`.
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(d: Date | null): string {
  if (!d) return '—';
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

// ── Uptime ───────────────────────────────────────────────────────────────────

export async function buildUptimeWorkbook(rows: UptimeReportRow[]): Promise<Buffer> {
  const wb = new Workbook();
  wb.creator = 'Aniston VMS';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Uptime');
  sheet.columns = [
    { header: 'Region', key: 'regionName', width: 16 },
    { header: 'Zone', key: 'zoneName', width: 16 },
    { header: 'Site', key: 'siteName', width: 20 },
    { header: 'Camera Code', key: 'cameraCode', width: 14 },
    { header: 'Camera Name', key: 'cameraName', width: 24 },
    { header: 'Downtime (s)', key: 'downtimeSeconds', width: 14 },
    { header: 'Uptime %', key: 'uptimePercent', width: 12 },
    { header: 'SLA Target %', key: 'slaTargetPercent', width: 14 },
    { header: 'SLA Met', key: 'slaCompliant', width: 10 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow({
      regionName: row.regionName,
      zoneName: row.zoneName,
      siteName: row.siteName,
      cameraCode: row.cameraCode,
      cameraName: row.cameraName,
      downtimeSeconds: row.downtimeSeconds,
      uptimePercent: row.uptimePercent,
      slaTargetPercent: row.slaTargetPercent,
      slaCompliant: row.slaCompliant ? 'YES' : 'NO',
    });
  }
  if (rows.length === 0) sheet.addRow({ regionName: 'No cameras matched the requested filters.' });

  // exceljs ships a broken local `declare interface Buffer extends ArrayBuffer {}`
  // in its own .d.ts, which shadows Node's real Buffer inside that module and
  // makes writeBuffer()'s declared return type incompatible with ours even
  // though the runtime value IS a real Buffer. Buffer.from() re-wraps it as
  // the real Node Buffer type without copying semantics that matter here.
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function buildUptimePdf(rows: UptimeReportRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('Camera Uptime Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(9);

    if (rows.length === 0) {
      doc.text('No cameras matched the requested filters.');
    }
    for (const row of rows) {
      doc
        .text(
          `${row.regionName} / ${row.zoneName} / ${row.siteName} / ${row.cameraCode} (${row.cameraName}) — ` +
            `uptime ${row.uptimePercent.toFixed(2)}% (target ${row.slaTargetPercent}%, ` +
            `${row.slaCompliant ? 'MET' : 'MISSED'}), downtime ${row.downtimeSeconds}s`
        )
        .moveDown(0.25);
    }

    doc.end();
  });
}

// ── Incidents ────────────────────────────────────────────────────────────────

export async function buildIncidentsWorkbook(rows: IncidentsReportRow[]): Promise<Buffer> {
  const wb = new Workbook();
  wb.creator = 'Aniston VMS';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Incidents');
  sheet.columns = [
    { header: 'Incident #', key: 'incidentNumber', width: 20 },
    { header: 'Zone', key: 'zoneName', width: 16 },
    { header: 'Site', key: 'siteName', width: 20 },
    { header: 'Camera', key: 'cameraCode', width: 14 },
    { header: 'Type', key: 'type', width: 20 },
    { header: 'Severity', key: 'severity', width: 10 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'First Detected', key: 'firstDetectedAt', width: 20 },
    { header: 'Acknowledged', key: 'acknowledgedAt', width: 20 },
    { header: 'Resolved', key: 'resolvedAt', width: 20 },
    { header: 'Downtime (s)', key: 'downtimeSeconds', width: 14 },
    { header: 'Root Cause', key: 'rootCause', width: 30 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow({
      incidentNumber: row.incidentNumber,
      zoneName: row.zoneName,
      siteName: row.siteName,
      cameraCode: row.cameraCode ?? '(site-wide)',
      type: row.type,
      severity: row.severity,
      status: row.status,
      firstDetectedAt: fmtDate(row.firstDetectedAt),
      acknowledgedAt: fmtDate(row.acknowledgedAt),
      resolvedAt: fmtDate(row.resolvedAt),
      downtimeSeconds: row.downtimeSeconds ?? '',
      rootCause: row.rootCause ?? '',
    });
  }
  if (rows.length === 0)
    sheet.addRow({ incidentNumber: 'No incidents matched the requested filters.' });

  const counts = calculateIncidentCountsBySeverity(rows);
  const summarySheet = wb.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Severity', key: 'severity', width: 16 },
    { header: 'Count', key: 'count', width: 10 },
  ];
  summarySheet.getRow(1).font = { bold: true };
  for (const [severity, count] of Object.entries(counts)) {
    summarySheet.addRow({ severity, count });
  }
  summarySheet.addRow({ severity: 'TOTAL', count: rows.length });

  // See buildUptimeWorkbook() above for why this can't be a bare return.
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function buildIncidentsPdf(rows: IncidentsReportRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('Incident Report', { align: 'center' });
    doc.moveDown();

    const counts = calculateIncidentCountsBySeverity(rows);
    doc.fontSize(10);
    doc.text(`Total incidents: ${rows.length}`);
    for (const [severity, count] of Object.entries(counts)) {
      doc.text(`  ${severity}: ${count}`);
    }
    doc.moveDown();

    doc.fontSize(9);
    if (rows.length === 0) {
      doc.text('No incidents matched the requested filters.');
    }
    for (const row of rows) {
      doc
        .text(
          `${row.incidentNumber} [${row.severity}/${row.status}] ${row.zoneName} / ${row.siteName}` +
            `${row.cameraCode ? ` / ${row.cameraCode}` : ' (site-wide)'} — ` +
            `detected ${fmtDate(row.firstDetectedAt)}, ack ${fmtDate(row.acknowledgedAt)}, ` +
            `resolved ${fmtDate(row.resolvedAt)}` +
            `${row.downtimeSeconds != null ? `, downtime ${row.downtimeSeconds}s` : ''}`
        )
        .moveDown(0.25);
    }

    doc.end();
  });
}
