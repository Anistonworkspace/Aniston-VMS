import type { IncidentSeverity, IncidentStatus } from './incidents.types';

/** Mirrors backend incident.constants.ts OPEN_STATUS_LIST. */
export const OPEN_STATUSES: readonly IncidentStatus[] = [
  'DETECTED',
  'CONFIRMED',
  'ALERTED',
  'ACKNOWLEDGED',
  'ASSIGNED',
  'INVESTIGATING',
];

/** Kanban lanes — the 9 lifecycle statuses grouped into 5 workable columns. */
export const KANBAN_COLUMNS: ReadonlyArray<{
  key: string;
  title: string;
  statuses: readonly IncidentStatus[];
}> = [
  { key: 'new', title: 'New', statuses: ['DETECTED', 'CONFIRMED', 'ALERTED'] },
  { key: 'acknowledged', title: 'Acknowledged', statuses: ['ACKNOWLEDGED', 'ASSIGNED'] },
  { key: 'investigating', title: 'Investigating', statuses: ['INVESTIGATING'] },
  { key: 'resolved', title: 'Resolved', statuses: ['RESOLVED', 'RECOVERY_VERIFIED'] },
  { key: 'closed', title: 'Closed', statuses: ['CLOSED'] },
];

export const STATUS_CHIP: Record<IncidentStatus, string> = {
  DETECTED: 'bg-state-critical-soft text-state-critical',
  CONFIRMED: 'bg-state-critical-soft text-state-critical',
  ALERTED: 'bg-state-critical-soft text-state-critical',
  ACKNOWLEDGED: 'bg-indigo-100 text-indigo-700',
  ASSIGNED: 'bg-indigo-100 text-indigo-700',
  INVESTIGATING: 'bg-sky-100 text-sky-700',
  RESOLVED: 'bg-state-healthy-soft text-state-healthy',
  RECOVERY_VERIFIED: 'bg-state-healthy-soft text-state-healthy',
  CLOSED: 'bg-gray-100 text-gray-600',
};

export const SEVERITY_VARIANT: Record<IncidentSeverity, 'danger' | 'warning' | 'info'> = {
  CRITICAL: 'danger',
  WARNING: 'warning',
  INFO: 'info',
};
