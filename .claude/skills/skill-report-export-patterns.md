# Skill — Report & Export Patterns

PDF generation, Excel export, streaming large datasets, download-ready notifications, and the frontend
`ReportExportBar`. Two report types cover almost every case: an **incident report** (what happened, when,
how long it took to recover) and a **health report** (current status of every camera across a zone/site).

---

## Backend — PDF generation (incident report)

```typescript
// backend/src/utils/pdfGenerator.ts
import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';

const STATUS_COLORS: Record<string, { fill: string; text: string }> = {
  HEALTHY:      { fill: '#E7F1EA', text: '#4E9C77' },
  WARNING:      { fill: '#FBF3DF', text: '#E2A93B' },
  CRITICAL:     { fill: '#FDE7E1', text: '#F25B3D' },
  MAINTENANCE:  { fill: '#E6E7F3', text: '#484C89' },
  UNKNOWN:      { fill: '#F0F0EE', text: '#9AA1A9' },
};

export async function generateIncidentReportPdf(data: IncidentReportData): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const chunks: Buffer[] = [];
  doc.on('data', c => chunks.push(c));

  doc.fontSize(18).fillColor('#21201E').text(`Incident report — ${data.zoneName}`, { align: 'center' });
  doc.fontSize(10).fillColor('#8A8F94').text(`${data.from} – ${data.to}`, { align: 'center' });
  doc.moveDown(1.5);

  const colWidths = [110, 90, 70, 90, 90, 80];
  const headers = ['Incident', 'Camera', 'Zone', 'Opened', 'Recovered', 'Status'];
  let x = doc.page.margins.left;
  const headerY = doc.y;
  headers.forEach((h, i) => { doc.fontSize(9).fillColor('#8A8F94').text(h, x, headerY, { width: colWidths[i] }); x += colWidths[i]; });
  doc.moveDown(0.5);

  data.rows.forEach(row => {
    if (doc.y > 720) doc.addPage();  // paginate before overflowing the page
    x = doc.page.margins.left;
    const rowY = doc.y;
    const cells = [row.code, row.cameraName, row.zoneName, row.openedAt, row.recoveredAt ?? '—', row.status];
    cells.forEach((cell, i) => {
      if (i === 5) {
        const c = STATUS_COLORS[row.status] ?? STATUS_COLORS.UNKNOWN;
        doc.roundedRect(x, rowY - 2, colWidths[i] - 8, 16, 8).fillColor(c.fill).fill();
        doc.fontSize(9).fillColor(c.text).text(cell, x + 4, rowY, { width: colWidths[i] - 12 });
      } else {
        doc.fontSize(9).fillColor('#21201E').text(cell, x, rowY, { width: colWidths[i] });
      }
      x += colWidths[i];
    });
    doc.moveDown(1);
  });

  doc.end();
  return new Promise(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))));
}
```

- [ ] Status cells are pill-shaped and use the exact `STATUS_COLORS` table from `skill-ui-ux-checklist.md`
  §3 — a PDF with the wrong critical/warning color is a compliance problem, not just a style nit
- [ ] Pagination check (`doc.y > 720`) happens **before** drawing the row, not after — otherwise the last row
  on a page silently gets cut off
- [ ] Header/footer repeats org name + date range on every page (add on `pageAdded` event) for long reports

---

## Backend — Excel export (health report)

```typescript
// backend/src/utils/excelExporter.ts
import ExcelJS from 'exceljs';

export async function generateHealthReportExcel(data: HealthReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Health report');

  sheet.columns = [
    { header: 'Camera',        key: 'cameraName',    width: 24 },
    { header: 'Zone',          key: 'zoneName',      width: 18 },
    { header: 'Reachability',  key: 'reachability',  width: 14 },
    { header: 'RTSP',          key: 'rtsp',           width: 12 },
    { header: 'ONVIF',         key: 'onvif',          width: 12 },
    { header: 'Recording',     key: 'recording',      width: 14 },
    { header: 'Overall status',key: 'status',         width: 16 },
    { header: 'Last checked',  key: 'lastCheckedAt',  width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F5F1' } };

  data.rows.forEach(row => {
    const excelRow = sheet.addRow(row);
    const statusCell = excelRow.getCell('status');
    const argb = { HEALTHY: 'FFE7F1EA', WARNING: 'FFFBF3DF', CRITICAL: 'FFFDE7E1', MAINTENANCE: 'FFE6E7F3', UNKNOWN: 'FFF0F0EE' }[row.status] ?? 'FFF0F0EE';
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  });

  sheet.autoFilter = { from: 'A1', to: `H${data.rows.length + 1}` };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
```

- [ ] `autoFilter` is always on for exports with more than a handful of rows — an ops manager filtering by
  zone/status in Excel is the #1 reason they asked for the export in the first place
- [ ] Header fill is `--surface` (`#F6F5F1`), never a random Excel default blue/green

---

## Backend — Controller wiring (sync for small ranges)

```typescript
// backend/src/modules/report/report.controller.ts
reportRouter.get(
  '/incidents/export/pdf',
  authenticate,
  requirePermission('reports', 'read'),
  validateRequest({ query: IncidentReportQuerySchema }),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const data = await ReportService.getIncidentReportData(req.query, req.user);
      const buffer = await generateIncidentReportPdf(data);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="incident-report-${data.zoneName}.pdf"`);
      res.send(buffer);
    } catch (err) { next(err); }
  },
);
```

- [ ] Same `requirePermission`/`validateRequest` guard rails as every other route — an export endpoint is
  still a read of potentially org-scoped incident data, never exempt from RBAC
- [ ] `Content-Disposition` filename is descriptive (zone/site + report type), not `report.pdf` for every download

---

## Backend — Async export via queue (large date ranges)

```typescript
// backend/src/queues/reportQueue.ts — BullMQ, for reports spanning >30 days or an entire org
export async function queueReportExport(params: { type: 'incident' | 'health'; format: 'pdf' | 'excel'; query: unknown; requestedBy: string }) {
  const job = await reportQueue.add('generate-report', params);
  return { jobId: job.id };
}

// Worker
reportQueue.process('generate-report', async job => {
  const { type, format, query, requestedBy } = job.data;
  const data = type === 'incident' ? await ReportService.getIncidentReportData(query) : await ReportService.getHealthReportData(query);
  const buffer = format === 'pdf'
    ? await (type === 'incident' ? generateIncidentReportPdf(data) : generateHealthReportPdf(data))
    : await generateHealthReportExcel(data);

  const fileUrl = await uploadToStorage(buffer, `reports/${requestedBy}/${Date.now()}.${format === 'pdf' ? 'pdf' : 'xlsx'}`);
  await NotificationService.send(requestedBy, {
    channel: 'whatsapp',
    message: `Your ${type} report is ready to download.`,
    fileUrl,
  });
});
```

- [ ] Anything spanning more than ~30 days or a whole organization goes through the queue, not the request/response cycle — never block an HTTP request for a multi-minute export
- [ ] Operator is notified via the same WhatsApp/email channel used for incident escalation — reuse
  `NotificationService`, don't build a second notification path just for reports

---

## Frontend — Export mutations

```typescript
// frontend/src/features/reports/reportApi.ts
export const reportApi = createApi({
  reducerPath: 'reportApi',
  baseQuery,
  endpoints: (builder) => ({
    exportIncidentReportPdf: builder.mutation<Blob, IncidentReportQuery>({
      query: (params) => ({ url: '/reports/incidents/export/pdf', params, responseHandler: (res) => res.blob() }),
    }),
    startHealthReportExport: builder.mutation<{ jobId: string }, HealthReportQuery & { format: 'pdf' | 'excel' }>({
      query: (body) => ({ url: '/reports/health/export/start', method: 'POST', body }),
    }),
  }),
});

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] `revokeObjectURL` always runs after the click — a report export screen left open all day shouldn't
  leak blob URLs
- [ ] Large/async exports return a `jobId` immediately — the UI shows a "Preparing your report…" state and
  the operator is notified when it's ready, they don't sit on a spinner

---

## Frontend — `ReportExportBar`

```typescript
// frontend/src/components/reports/ReportExportBar.tsx
function ReportExportBar({ scope, filters }: { scope: 'incident' | 'health'; filters: IncidentReportQuery | HealthReportQuery }) {
  const [exportPdf, { isLoading: exportingPdf }] = useExportIncidentReportPdfMutation();
  const [startExport, { isLoading: queuing }] = useStartHealthReportExportMutation();
  const isLargeRange = isRangeOver(filters, 30); // days

  const handleExport = async (format: 'pdf' | 'excel') => {
    if (isLargeRange) {
      await startExport({ ...filters, format }).unwrap();
      toast.info('Preparing your report — we\'ll notify you on WhatsApp when it\'s ready.');
    } else {
      const blob = await exportPdf(filters).unwrap();
      downloadBlob(blob, `${scope}-report.${format === 'pdf' ? 'pdf' : 'xlsx'}`);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-tile)] bg-[var(--card)] p-2 shadow-[var(--shadow-soft)]">
      <ClipRangeSelector value={filters} />
      <div className="flex-1" />
      <button className="btn btn--secondary btn--sm" onClick={() => handleExport('excel')} disabled={queuing}>Excel</button>
      <button className="btn btn--primary btn--sm" onClick={() => handleExport('pdf')} disabled={exportingPdf}>
        {exportingPdf ? '⟳' : '↓'} PDF
      </button>
    </div>
  );
}
```

- [ ] `ReportExportBar` is the single shared export control for both incident and health reports — don't
  fork a bespoke export button per page
- [ ] Reuses `ClipRangeSelector` for date-range input — same date-picking component the playback/clip
  screens use, not a second date-range widget
- [ ] Large-range exports queue silently with a toast, never freeze the export button for minutes

---

## Checklist

- [ ] PDF/Excel status colors match `skill-ui-ux-checklist.md` §3 exactly — no drifting to different hexes
  because "it's just an export, no one will notice" (auditors do)
- [ ] Pagination in the PDF generator checks `doc.y` before drawing each row, not after
- [ ] Excel exports always set `autoFilter` and bold+`--surface`-filled header row
- [ ] Every export route is behind the same `requirePermission`/`validateRequest` guards as its list endpoint
- [ ] Exports over ~30 days or org-wide scope go through the BullMQ queue with a WhatsApp/email
  ready-notification — never block the request thread
- [ ] `ReportExportBar` is reused for both report types; blob URLs are revoked after download
