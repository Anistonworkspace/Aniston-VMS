import type { DiagnosisCode } from './analytics.types';

// Short UI labels for the backend diagnosis codes (mirrors the semantics of
// health.diagnosis.ts DIAGNOSIS_TEXT — the plain-language root causes of PRD §6.9).
export const DIAGNOSIS_LABEL: Record<DiagnosisCode, string> = {
  SITE_INTERNET_DOWN: 'Site internet down',
  SIM_SIGNAL_ISSUE: 'SIM signal issue',
  NETWORK_UNSTABLE: 'Unstable network',
  CAMERA_OFFLINE: 'Camera offline',
  STREAM_DEGRADED: 'Degraded stream',
  IMAGE_PROBLEM: 'Image problem — needs cleaning',
  CONFIG_ERROR: 'Configuration error',
};

/** Distribution-bar colours for the root-cause panel (severity-ish ordering). */
export const DIAGNOSIS_BAR_CLASS: Record<DiagnosisCode, string> = {
  SITE_INTERNET_DOWN: 'bg-state-critical',
  CAMERA_OFFLINE: 'bg-state-critical/70',
  SIM_SIGNAL_ISSUE: 'bg-state-warning',
  NETWORK_UNSTABLE: 'bg-state-warning/70',
  STREAM_DEGRADED: 'bg-state-maintenance',
  IMAGE_PROBLEM: 'bg-indigo',
  CONFIG_ERROR: 'bg-state-unknown',
};
