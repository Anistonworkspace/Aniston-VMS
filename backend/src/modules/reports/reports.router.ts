import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { authUser, requireAuth } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validation.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { audit } from '../../lib/audit.js';
import { storage, signStorageUrl } from '../../lib/storage.js';
import {
  incidentsReportQuerySchema,
  reportExportQuerySchema,
  uptimeReportQuerySchema,
  type IncidentsReportQuery,
  type ReportExportQuery,
  type UptimeReportQuery,
} from './reports.schemas.js';
import * as reportsService from './reports.service.js';
import {
  buildIncidentsPdf,
  buildIncidentsWorkbook,
  buildUptimePdf,
  buildUptimeWorkbook,
} from './reports.export.js';

// ─────────────────────────────────────────────────────────────────────────────
// Reporting API (mounted at /api — see app.ts for where every other module's
// router is wired in; this file intentionally does not touch app.ts):
//   GET /reports/uptime    — per-camera uptime % vs REPORTS_SLA_UPTIME_TARGET_PCT
//                            (?startDate&endDate&regionId&zoneId&siteId&cameraId)
//   GET /reports/incidents — incident rows + MTTA/MTTR/severity summary
//                            (same filters + ?severity)
//   GET /reports/export    — renders either report to xlsx/pdf, stores it via
//                            lib/storage.ts, and returns a signed download URL
//                            (?type=uptime|incidents&format=xlsx|pdf + filters)
//
// No requireRole() gate on any of these — every authenticated role (including
// CLIENT_VIEWER/AUDITOR) already sees this data scoped to their access scope
// via lib/scope.ts, and exporting is just a rendering of what they can already
// view, not a state-changing action on cameras/incidents. All three routes
// still go through requireAuth + the caller's resolved scope, so no data
// outside a user's zones/sites/regions is ever included.
// ─────────────────────────────────────────────────────────────────────────────

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PDF_CONTENT_TYPE = 'application/pdf';

export const reportRouter = Router();

reportRouter.use(requireAuth);

reportRouter.get(
  '/reports/uptime',
  validateRequest({ query: uptimeReportQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as UptimeReportQuery;
    const data = await reportsService.getUptimeReport(authUser(req).id, query);
    res.json({ success: true, data });
  })
);

reportRouter.get(
  '/reports/incidents',
  validateRequest({ query: incidentsReportQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as IncidentsReportQuery;
    const data = await reportsService.getIncidentsReport(authUser(req).id, query);
    res.json({ success: true, data });
  })
);

reportRouter.get(
  '/reports/export',
  validateRequest({ query: reportExportQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as ReportExportQuery;
    const user = authUser(req);

    let buffer: Buffer;

    if (query.type === 'uptime') {
      const report = await reportsService.getUptimeReport(user.id, query);
      buffer =
        query.format === 'xlsx'
          ? await buildUptimeWorkbook(report.rows)
          : await buildUptimePdf(report.rows);
    } else {
      const report = await reportsService.getIncidentsReport(user.id, query);
      buffer =
        query.format === 'xlsx'
          ? await buildIncidentsWorkbook(report.rows)
          : await buildIncidentsPdf(report.rows);
    }
    const contentType: string = query.format === 'xlsx' ? XLSX_CONTENT_TYPE : PDF_CONTENT_TYPE;

    const reportId = randomUUID();
    const filename = `${query.type}-report-${reportId}.${query.format}`;
    const key = `reports/${query.type}/${filename}`;

    await storage.put(key, buffer, contentType);

    // Report exports create a stored artifact — audit it like every other
    // mutation, even though the underlying report data is read-only.
    await audit(req, {
      userId: user.id,
      action: 'report.export',
      entityType: 'Report',
      entityId: reportId,
      newValue: {
        type: query.type,
        format: query.format,
        startDate: query.startDate.toISOString(),
        endDate: query.endDate.toISOString(),
        regionId: query.regionId ?? null,
        zoneId: query.zoneId ?? null,
        siteId: query.siteId ?? null,
        cameraId: query.cameraId ?? null,
        key,
      },
    });

    res.json({
      success: true,
      data: { downloadUrl: signStorageUrl(key, { filename, contentType }) },
    });
  })
);
