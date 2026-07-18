import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Request validation for the reporting API (see reports.router.ts). All
// report endpoints share the same date-range + scope-hierarchy filters;
// the incident-flavored endpoints additionally accept `severity`.
//
// NOTE: the `REPORTS_MAX_RANGE_DAYS` check is NOT done here — it needs the
// env var value and throws the shared `ValidationError` class so it renders
// identically to every other business-rule rejection in the app. See
// `assertRangeWithinLimit()` in reports.service.ts.
// ─────────────────────────────────────────────────────────────────────────────

const reportFiltersSchema = z.object({
  startDate: z.coerce.date({ errorMap: () => ({ message: 'startDate must be a valid date' }) }),
  endDate: z.coerce.date({ errorMap: () => ({ message: 'endDate must be a valid date' }) }),
  regionId: z.string().uuid().optional(),
  zoneId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  cameraId: z.string().uuid().optional(),
});

export const uptimeReportQuerySchema = reportFiltersSchema;
export type UptimeReportQuery = z.infer<typeof uptimeReportQuerySchema>;

export const incidentsReportQuerySchema = reportFiltersSchema.extend({
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).optional(),
});
export type IncidentsReportQuery = z.infer<typeof incidentsReportQuerySchema>;

export const reportExportQuerySchema = reportFiltersSchema.extend({
  type: z.enum(['uptime', 'incidents']),
  format: z.enum(['xlsx', 'pdf']),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).optional(),
});
export type ReportExportQuery = z.infer<typeof reportExportQuerySchema>;
