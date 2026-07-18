import type { CameraStatus } from '@/features/cameras/cameras.types';

/** Root-cause codes produced by backend health.diagnosis.ts (keys of DIAGNOSIS_TEXT, PRD §6.9). */
export type DiagnosisCode =
  | 'SITE_INTERNET_DOWN'
  | 'SIM_SIGNAL_ISSUE'
  | 'NETWORK_UNSTABLE'
  | 'CAMERA_OFFLINE'
  | 'STREAM_DEGRADED'
  | 'IMAGE_PROBLEM'
  | 'CONFIG_ERROR';

/** Row of GET /cameras/health — health.service.ts getCameraHealthList() select. */
export interface CameraHealthRow {
  id: string;
  cameraCode: string;
  name: string;
  status: CameraStatus;
  healthScore: number;
  diagnosis: DiagnosisCode | null;
  lastHealthyAt: string | null;
  site: { id: string; name: string; zone: { id: string; name: string } };
}

/** Row of GET /zones/health-rollup — health.service.ts getZoneRollups(). */
export interface ZoneRollup {
  zoneId: string;
  zoneName: string;
  region: { id: string; name: string };
  siteCount: number;
  cameraCount: number;
  healthy: number;
  warning: number;
  critical: number;
  maintenance: number;
  unknown: number;
  avgHealthScore: number;
}

/** Row of GET /cameras/:id/health/quality — prisma ConnectionQualityHourly. */
export interface QualityPoint {
  id: string;
  cameraId: string;
  hour: string;
  /** Success ratio over the hour; backend stores 0–1 (see health.diagnosis.ts "(0-1)" convention). */
  successRate: number;
  medianLatencyMs: number;
  jitterMs: number;
  minSignalDbm: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CameraQualityArgs {
  cameraId: string;
  hours: number;
}

export const QUALITY_RANGE_OPTIONS = [
  { hours: 24, label: '24h' },
  { hours: 72, label: '3d' },
  { hours: 168, label: '7d' },
] as const;
