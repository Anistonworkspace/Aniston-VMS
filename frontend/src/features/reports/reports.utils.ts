import { differenceInCalendarDays, format, subDays } from 'date-fns';
import type { ReportScopeFilters } from './reports.types';

/** `YYYY-MM-DD` for the given date, suitable for `<input type="date">` and the reports query params. */
export function toDateInputValue(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** Default filter range shown when the Reports page first loads: the last 30 days (inclusive of today). */
export function defaultDateRange(): { startDate: string; endDate: string } {
  const today = new Date();
  return { startDate: toDateInputValue(subDays(today, 29)), endDate: toDateInputValue(today) };
}

/** Inclusive day count between two `YYYY-MM-DD` strings; negative if `endDate` is before `startDate`. */
export function rangeDaysBetween(startDate: string, endDate: string): number {
  return differenceInCalendarDays(new Date(endDate), new Date(startDate));
}

// backend/src/config/env.ts defines `REPORTS_MAX_RANGE_DAYS` with a
// `.default(92)` — the *actual* deployed value can differ per environment and
// is not exposed by any API response. This constant is only a client-side UX
// hint (soft warning, never blocks submission); the backend's own
// `assertRangeWithinLimit()` (reports.service.ts) is the sole source of truth
// and returns the real configured value in its rejection message, which
// surfaces verbatim through getApiErrorMessage() if a request is rejected.
export const ASSUMED_MAX_RANGE_DAYS = 92;

/** Formats a whole-second duration as e.g. `"2h 14m"`, `"46m"`, `"< 1m"`, or `"0m"`. */
export function formatDurationShort(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || Number.isNaN(totalSeconds)) return '—';
  if (totalSeconds <= 0) return '0m';
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 1) return '< 1m';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/** Formats a whole-minute duration (MTTA/MTTR) as e.g. `"1h 5m"`, `"12m"`. */
export function formatMinutesShort(totalMinutes: number | null | undefined): string {
  if (totalMinutes === null || totalMinutes === undefined || Number.isNaN(totalMinutes)) return '—';
  return formatDurationShort(Math.round(totalMinutes * 60));
}

/** Formats a percentage value (0-100) to one decimal place, e.g. `"99.5%"`. */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(1)}%`;
}

/** Formats an ISO timestamp as e.g. `"Jan 5, 2026"` — falls back to `"—"` for null/invalid input. */
export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'MMM d, yyyy');
}

/** Formats an ISO timestamp as e.g. `"Jan 5, 2026, 14:32"` — falls back to `"—"` for null/invalid input. */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'MMM d, yyyy, HH:mm');
}

/**
 * Human-readable one-line summary of a report's filters, for the client-local
 * generated-reports history list (see useGeneratedReports.ts) — built from ids
 * only (no name lookups) since the picker labels aren't available where an
 * export is triggered from.
 */
export function buildFiltersSummary(filters: ReportScopeFilters, extra?: string): string {
  const parts = [
    `${toDateInputValue(new Date(filters.startDate))} → ${toDateInputValue(new Date(filters.endDate))}`,
  ];
  const scoped = [
    filters.regionId && 'region',
    filters.zoneId && 'zone',
    filters.siteId && 'site',
    filters.cameraId && 'camera',
  ].filter(Boolean);
  parts.push(scoped.length > 0 ? `scoped by ${scoped.join(', ')}` : 'all cameras');
  if (extra) parts.push(extra);
  return parts.join(' · ');
}
