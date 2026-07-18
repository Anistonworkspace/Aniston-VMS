import type { Diagnosis, GeneratedReportStatus, IncidentStatus, Severity } from './reports.types';

// components/ui/Badge.tsx does not export a `BadgeProps` type — mirror its
// internal `variants` map keys here instead of importing them.
type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple';

export const SEVERITY_BADGE_VARIANT: Record<Severity, BadgeVariant> = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'danger',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  INFO: 'Info',
  WARNING: 'Warning',
  CRITICAL: 'Critical',
};

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  DETECTED: 'Detected',
  CONFIRMED: 'Confirmed',
  ALERTED: 'Alerted',
  ACKNOWLEDGED: 'Acknowledged',
  ASSIGNED: 'Assigned',
  INVESTIGATING: 'Investigating',
  RESOLVED: 'Resolved',
  RECOVERY_VERIFIED: 'Recovery Verified',
  CLOSED: 'Closed',
};

export const INCIDENT_STATUS_BADGE_VARIANT: Record<IncidentStatus, BadgeVariant> = {
  DETECTED: 'default',
  CONFIRMED: 'warning',
  ALERTED: 'warning',
  ACKNOWLEDGED: 'info',
  ASSIGNED: 'info',
  INVESTIGATING: 'purple',
  RESOLVED: 'success',
  RECOVERY_VERIFIED: 'success',
  CLOSED: 'default',
};

export const DIAGNOSIS_LABEL: Record<Diagnosis, string> = {
  SITE_INTERNET_DOWN: 'Site internet down',
  SIM_SIGNAL_ISSUE: 'SIM signal issue',
  NETWORK_UNSTABLE: 'Network unstable',
  CAMERA_OFFLINE: 'Camera offline',
  CONFIG_ERROR: 'Config error',
  STREAM_DEGRADED: 'Stream degraded',
  IMAGE_PROBLEM: 'Image problem',
};

export const GENERATED_REPORT_STATUS_LABEL: Record<GeneratedReportStatus, string> = {
  PROCESSING: 'Processing',
  READY: 'Ready',
  FAILED: 'Failed',
};

export const GENERATED_REPORT_STATUS_BADGE_VARIANT: Record<GeneratedReportStatus, BadgeVariant> = {
  PROCESSING: 'info',
  READY: 'success',
  FAILED: 'danger',
};
