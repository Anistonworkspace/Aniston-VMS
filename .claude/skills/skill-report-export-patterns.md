# Skill — Report & Export Patterns

PDF generation, Excel export, streaming large datasets, download button wiring.

---

## Backend — PDF generation

```typescript
// backend/src/utils/pdfGenerator.ts — already exists, extends this pattern
import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';

export async function generateItemReportPdf(data: ItemReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 40, size: 'A4' });
    const stream = new PassThrough();
    const chunks: Buffer[] = [];

    stream.on('data',  (chunk) => chunks.push(chunk));
    stream.on('end',   () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    doc.pipe(stream);

    // ── Header ────────────────────────────────────────────────────────────
    doc.fontSize(20).fillColor('#0073ea').text('Item Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#676879')
       .text(`Organization: ${data.orgName}`, { align: 'center' })
       .text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, { align: 'center' });
    doc.moveDown(1);

    // ── Summary row ───────────────────────────────────────────────────────
    const summaryY = doc.y;
    const summaries = [
      { label: 'Total Items', value: data.total },
      { label: 'Approved',    value: data.approved },
      { label: 'Pending',     value: data.pending },
      { label: 'Rejected',    value: data.rejected },
    ];
    const colW = (doc.page.width - 80) / summaries.length;
    summaries.forEach(({ label, value }, i) => {
      doc.rect(40 + i * colW, summaryY, colW - 4, 50).fillAndStroke('#f0f4ff', '#d0d4e4');
      doc.fillColor('#323338').fontSize(22).text(String(value), 40 + i * colW, summaryY + 6, { width: colW - 4, align: 'center' });
      doc.fillColor('#676879').fontSize(9).text(label,           40 + i * colW, summaryY + 32, { width: colW - 4, align: 'center' });
    });
    doc.moveDown(5);

    // ── Table ─────────────────────────────────────────────────────────────
    const headers = ['Owner', 'Type', 'From', 'To', 'Days', 'Status'];
    const colWidths = [150, 70, 70, 70, 40, 70];
    const tableX = 40;
    let y = doc.y;

    // Header row
    doc.fillColor('#0073ea').rect(tableX, y, doc.page.width - 80, 22).fill();
    let x = tableX + 6;
    headers.forEach((h, i) => {
      doc.fillColor('#ffffff').fontSize(9).text(h, x, y + 6, { width: colWidths[i] });
      x += colWidths[i];
    });
    y += 22;

    // Data rows
    data.rows.forEach((row, idx) => {
      if (y > doc.page.height - 80) { doc.addPage(); y = 40; }
      doc.fillColor(idx % 2 === 0 ? '#ffffff' : '#f6f7fb').rect(tableX, y, doc.page.width - 80, 20).fill();
      x = tableX + 6;
      [row.owner, row.type, row.from, row.to, row.days, row.status].forEach((cell, i) => {
        doc.fillColor('#323338').fontSize(8).text(String(cell ?? ''), x, y + 5, { width: colWidths[i] - 6 });
        x += colWidths[i];
      });
      y += 20;
    });

    doc.end();
  });
}
```

---

## Backend — Excel export

```typescript
// backend/src/utils/excelExporter.ts — already exists, use this pattern
import ExcelJS from 'exceljs';

export async function generateItemReportExcel(data: ItemReportData): Promise<Buffer> {
  const workbook  = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Items');

  // Column definitions
  worksheet.columns = [
    { header: 'Owner',      key: 'owner',      width: 25 },
    { header: 'Type',       key: 'type',       width: 15 },
    { header: 'From',       key: 'from',       width: 15 },
    { header: 'To',         key: 'to',         width: 15 },
    { header: 'Days',       key: 'days',       width: 8  },
    { header: 'Status',     key: 'status',     width: 15 },
    { header: 'Submitted',  key: 'createdAt',  width: 20 },
  ];

  // Style header row
  worksheet.getRow(1).eachCell(cell => {
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0073EA' } };
    cell.font   = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFD0D4E4' } } };
  });
  worksheet.getRow(1).height = 28;

  // Data rows
  data.rows.forEach((row, idx) => {
    const excelRow = worksheet.addRow({
      owner:     row.owner,
      type:      row.type,
      from:      row.from,
      to:        row.to,
      days:      row.days,
      status:    row.status,
      createdAt: row.createdAt,
    });
    // Zebra stripe
    if (idx % 2 !== 0) {
      excelRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F7FB' } };
      });
    }
    // Color status column
    const statusCell = excelRow.getCell('status');
    const colors: Record<string, string> = { APPROVED: 'FF00854D', REJECTED: 'FFD83A52', PENDING: 'FFFF8C00' };
    if (colors[row.status]) statusCell.font = { color: { argb: colors[row.status] }, bold: true };
  });

  // Auto-filter
  worksheet.autoFilter = { from: 'A1', to: `G1` };

  return workbook.xlsx.writeBuffer() as Promise<Buffer>;
}
```

---

## Backend — Export controller

```typescript
// backend/src/modules/item/item.controller.ts
static async exportPdf(req: Request, res: Response, next: NextFunction) {
  try {
    const data   = await ItemService.getReportData(req.query, req.user);
    const buffer = await generateItemReportPdf(data);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="item-report-${Date.now()}.pdf"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) { next(err); }
}

static async exportExcel(req: Request, res: Response, next: NextFunction) {
  try {
    const data   = await ItemService.getReportData(req.query, req.user);
    const buffer = await generateItemReportExcel(data);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="item-report-${Date.now()}.xlsx"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) { next(err); }
}
```

---

## Frontend — Download button (RTK Query mutation)

```typescript
// RTK Query — export mutation (binary response)
exportItemsPdf: builder.mutation<void, ItemListQuery>({
  query: (params) => ({
    url: '/items/export/pdf',
    method: 'GET',
    params,
    responseHandler: async (response) => {
      // Download the binary blob
      const blob = await response.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `item-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  }),
}),
```

```typescript
// In the component
const [exportPdf, { isLoading: isExporting }] = useExportItemsPdfMutation();

<button
  className="btn btn--secondary btn--sm"
  onClick={() => exportPdf(currentFilters)}
  disabled={isExporting}
>
  {isExporting ? '⟳ Generating...' : '↓ Export PDF'}
</button>
```

---

## Large export via background job (for > 1000 rows)

```typescript
// Service — queue the export, notify when ready
static async queueExport(query: ItemListQuery, actor: AuthUser) {
  const job = await exportQueue.add('item-export', {
    organizationId: actor.organizationId,
    requestedBy: actor.id,
    module: 'items',
    filters: query,
  });

  return { jobId: job.id, message: 'Export started. You will be notified when ready.' };
}
```

```typescript
// Frontend — trigger export + listen for socket notification
const [startExport] = useStartItemExportMutation();

await startExport(filters);
toast.info('Export started — check your notifications when ready');
// Worker emits 'export:ready' with fileUrl → NotificationService sends it
```

---

## Checklist

- [ ] PDF has header with org name + date + summary KPI cards
- [ ] Excel has styled header row (brand colors), zebra striping, status coloring, auto-filter
- [ ] Small exports (<500 rows): synchronous controller, buffer response
- [ ] Large exports (>500 rows): BullMQ job, socket notification when ready
- [ ] Download headers: `Content-Disposition: attachment; filename="..."` with timestamp
- [ ] Frontend uses `responseHandler` to trigger native browser download (no new tab)
- [ ] Export button disabled while generating
- [ ] Export respects the current filter state (not the whole table)
