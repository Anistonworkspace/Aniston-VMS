// Aniston VMS reports domain types — mirrors backend EXACTLY:
//   backend/src/modules/reports/reports.schemas.ts  (query validation)
//   backend/src/modules/reports/reports.service.ts  (ReportScopeFilters,
//     UptimeReportRow/Result, IncidentsReportRow/Result)
// Severity / IncidentStatus / Diagnosis literal unions mirror
// shared/src/enums.ts exactly — kept as local string-literal unions here
// instead of importing the runtime enum objects from '@aniston-vms/shared',
// same convention already used by features/auth/auth.types.ts's `Role` union.

export type ReportKind = 'uptime' | 'incidents';
export type ReportFormat = 'xlsx' | 'pdf';

export type Severity = 'INFO' | 'WARNING' | 'CRITICAL';
export const SEVERITY_VALUES: Severity[] = ['INFO', 'WARNING', 'CRITICAL'];

export type IncidentStatus =
  | 'DETECTED'
  | 'CONFIRMED'
  | 'ALERTED'
  | 'ACKNOWLEDGED'
  | 'ASSIGNED'
  | 'INVESTIGATING'
  | 'RESOLVED'
  | 'RECOVERY_VERIFIED'
  | 'CLOSED';

export type Diagnosis =
  | 'SITE_INTERNET_DOWN'
  | 'SIM_SIGNAL_ISSUE'
  | 'NETWORK_UNSTABLE'
  | 'CAMERA_OFFLINE'
  | 'CONFIG_ERROR'
  | 'STREAM_DEGRADED'
  | 'IMAGE_PROBLEM';

// ── Shared scope + date-range filters ───────────────────────────────────────
// Mirrors backend `reportFiltersSchema` (reports.schemas.ts) and the
// `ReportScopeFilters` interface (reports.service.ts). Dates are sent as
// `YYYY-MM-DD` strings (from <input type="date">) — the backend coerces them
// with `z.coerce.date()`.
export interface ReportScopeFilters {
  startDate: string;
  endDate: string;
  regionId?: string;
  zoneId?: string;
  siteId?: string;
  cameraId?: string;
}

export interface IncidentsReportFilters extends ReportScopeFilters {
  severity?: Severity;
}

// ── GET /reports/uptime ──────────────────────────────────────────────────────
export interface UptimeReportRow {
  cameraId: string;
  cameraCode: string;
  cameraName: string;
  siteId: string;
  siteName: string;
  zoneId: string;
  zoneName: string;
  regionId: string;
  regionName: string;
  downtimeSeconds: number;
  uptimePercent: number;
  slaTargetPercent: number;
  slaCompliant: boolean;
}

export interface UptimeReportSummary {
  cameraCount: number;
  averageUptimePercent: number;
  slaCompliantCount: number;
  slaNonCompliantCount: number;
}

export interface UptimeReportResult {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  slaTargetPercent: number;
  summary: UptimeReportSummary;
  rows: UptimeReportRow[];
}

// ── GET /reports/incidents ───────────────────────────────────────────────────
export interface IncidentsReportRow {
  incidentId: string;
  incidentNumber: string;
  cameraId: string | null;
  cameraCode: string | null;
  cameraName: string | null;
  siteId: string;
  siteName: string;
  zoneId: string;
  zoneName: string;
  type: string;
  severity: Severity;
  status: IncidentStatus;
  diagnosis: Diagnosis | null;
  firstDetectedAt: string;
  lastDetectedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  recoveryVerifiedAt: string | null;
  closedAt: string | null;
  downtimeSeconds: number | null;
  rootCause: string | null;
  resolutionNotes: string | null;
}

export interface IncidentsReportSummary {
  totalIncidents: number;
  countsBySeverity: Record<string, number>;
  mttaMinutes: number | null;
  mttrMinutes: number | null;
}

export interface IncidentsReportResult {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  summary: IncidentsReportSummary;
  rows: IncidentsReportRow[];
}

// ── GET /reports/export ──────────────────────────────────────────────────────
// Modeled as an RTK Query *mutation* even though the backend verb is GET: it
// has a side effect (writes a file via lib/storage.ts + an audit log entry —
// see reports.router.ts), so it is not a safe/idempotent read.
export interface ReportExportQuery extends ReportScopeFilters {
  type: ReportKind;
  format: ReportFormat;
  severity?: Severity;
}

export interface ReportExportResult {
  downloadUrl: string;
}

// ── Region / Zone / Site / Camera scope pickers ─────────────────────────────
// Backend hierarchy/camera list endpoints return `{ items, total, page, limit }`
// (backend/src/modules/hierarchy/hierarchy.service.ts, camera.service.ts) with
// far more fields than a filter dropdown needs — reports.api.ts's
// transformResponse narrows each item down to just this shape.
export interface ScopeOption {
  id: string;
  name: string;
}

export interface CameraOption {
  id: string;
  name: string;
  cameraCode: string;
}

// ── Client-local generated-report history (not a backend resource) ─────────
// The backend has no "list my exports" endpoint — every GET /reports/export
// call immediately returns a ready signed download URL, there is no
// PENDING/PROCESSING async job to poll. This history is purely a client-side
// convenience (persisted to localStorage) so the user can see/re-download
// reports they generated earlier in the session; see useGeneratedReports.ts.
export type GeneratedReportStatus = 'PROCESSING' | 'READY' | 'FAILED';

export interface GeneratedReport {
  id: string;
  type: ReportKind;
  format: ReportFormat;
  filtersSummary: string;
  requestedAt: string;
  status: GeneratedReportStatus;
  downloadUrl?: string;
  errorMessage?: string;
}
