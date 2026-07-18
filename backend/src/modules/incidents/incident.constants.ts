import type { Diagnosis, IncidentStatus, Severity } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// Stage 4 — incident rule matrix (docs/02-TRD.md §6.5).
// Maps a health-engine diagnosis to how the incident engine reacts:
//   scope     CAMERA → one incident per camera+type; SITE → one incident per
//             site+type with cameraId null (dependency suppression: a dead
//             router must not fan out 40 per-camera pages).
//   immediate true → skip the consecutive-failure streak (auth failures and
//             site outages don't self-heal, so alert on first detection).
// ─────────────────────────────────────────────────────────────────────────────

export interface IncidentRule {
  severity: Severity;
  scope: 'CAMERA' | 'SITE';
  immediate: boolean;
  title: string;
}

export const INCIDENT_RULES: Record<Diagnosis, IncidentRule> = {
  SITE_INTERNET_DOWN: {
    severity: 'CRITICAL',
    scope: 'SITE',
    immediate: true,
    title: 'Site internet down',
  },
  SIM_SIGNAL_ISSUE: {
    severity: 'WARNING',
    scope: 'SITE',
    immediate: false,
    title: 'SIM signal degraded',
  },
  NETWORK_UNSTABLE: {
    severity: 'WARNING',
    scope: 'CAMERA',
    immediate: false,
    title: 'Network unstable',
  },
  CAMERA_OFFLINE: {
    severity: 'CRITICAL',
    scope: 'CAMERA',
    immediate: false,
    title: 'Camera offline',
  },
  CONFIG_ERROR: {
    severity: 'CRITICAL',
    scope: 'CAMERA',
    immediate: true,
    title: 'Configuration error',
  },
  STREAM_DEGRADED: {
    severity: 'WARNING',
    scope: 'CAMERA',
    immediate: false,
    title: 'Stream degraded',
  },
  IMAGE_PROBLEM: {
    severity: 'WARNING',
    scope: 'CAMERA',
    immediate: false,
    title: 'Image problem',
  },
};

// Escalation ladder (docs §6.5): minutes since firstDetectedAt → recipient
// escalation_level. Level 1 fires at creation; the worker climbs the rest
// while the incident stays unacknowledged. Ack pauses reminders — it never
// resolves the fault.
export const ESCALATION_LADDER: ReadonlyArray<{ afterMinutes: number; level: number }> = [
  { afterMinutes: 10, level: 2 },
  { afterMinutes: 20, level: 3 },
  { afterMinutes: 30, level: 4 },
  { afterMinutes: 60, level: 5 },
];

// Everything before RESOLVED counts as "open" for dedup, Kanban and recovery.
export const OPEN_STATUS_LIST: IncidentStatus[] = [
  'DETECTED',
  'CONFIRMED',
  'ALERTED',
  'ACKNOWLEDGED',
  'ASSIGNED',
  'INVESTIGATING',
];
