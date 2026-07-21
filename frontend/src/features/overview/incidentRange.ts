// Time-range window for the "Recent incidents" card. Maps a UI choice to the
// GET /incidents `from` bound (lastDetectedAt >= from), which the backend
// supports natively (incident.schemas.ts) and enforces under the caller's zone
// scope — so narrowing the window never widens RBAC.
export type IncidentRange = '24h' | '7d' | '30d';

interface RangeOption {
  value: IncidentRange;
  label: string;
  hours: number;
}

const HOUR_MS = 3_600_000;

export const INCIDENT_RANGES: readonly RangeOption[] = [
  { value: '24h', label: 'Last 24 h', hours: 24 },
  { value: '7d', label: 'Last 7 days', hours: 24 * 7 },
  { value: '30d', label: 'Last 30 days', hours: 24 * 30 },
];

function optionFor(range: IncidentRange): RangeOption {
  return INCIDENT_RANGES.find((option) => option.value === range) ?? INCIDENT_RANGES[0];
}

/** ISO `from` bound for the selected window (defaults to now for the upper edge). */
export function rangeFromISO(range: IncidentRange, now: Date = new Date()): string {
  return new Date(now.getTime() - optionFor(range).hours * HOUR_MS).toISOString();
}

export function rangeLabel(range: IncidentRange): string {
  return optionFor(range).label;
}
