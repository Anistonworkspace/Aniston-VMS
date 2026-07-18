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
  SITE_INTERNET_DOWN: 'bg-red-400',
  CAMERA_OFFLINE: 'bg-red-300',
  SIM_SIGNAL_ISSUE: 'bg-amber-400',
  NETWORK_UNSTABLE: 'bg-amber-300',
  STREAM_DEGRADED: 'bg-sky-400',
  IMAGE_PROBLEM: 'bg-purple-400',
  CONFIG_ERROR: 'bg-gray-400',
};
