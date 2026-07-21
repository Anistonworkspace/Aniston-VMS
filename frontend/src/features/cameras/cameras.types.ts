// Shapes mirror the backend contracts exactly:
// - Camera:    backend/src/modules/cameras/camera.service.ts (sanitized — the
//              encrypted RTSP credential fields never leave the API)
// - Health:    backend/src/modules/health/health.service.ts getCameraHealth()
// - Checks:    prisma HealthCheck rows via GET /cameras/:id/health/checks
// - Snapshots: backend/src/modules/snapshots/snapshot.service.ts SnapshotDto
// All Date fields arrive as ISO strings over JSON.

export type CameraStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'MAINTENANCE' | 'UNKNOWN';

/**
 * prisma `Diagnosis` enum (SITE_INTERNET_DOWN, CAMERA_OFFLINE, …). The UI
 * renders the server-provided `diagnosisText`, so keep this open to new values.
 */
export type CameraDiagnosis = string;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface Camera {
  id: string;
  siteId: string;
  routerId: string;
  cameraCode: string;
  name: string;
  brand: string | null;
  model: string | null;
  firmware: string | null;
  serialNumber: string | null;
  onvifPort: number | null;
  /** CR-6 — WGS-84 map position registered via the add-camera MapLibre pin. */
  latitude: number;
  longitude: number;
  playbackAdapter: string;
  expectedCodec: string | null;
  expectedResolution: string | null;
  expectedFps: number | null;
  expectedBitrateKbps: number | null;
  healthScore: number;
  status: CameraStatus;
  diagnosis: CameraDiagnosis | null;
  lastHealthyAt: string | null;
  lastSnapshotAt: string | null;
  maintenanceMode: boolean;
  createdAt: string;
  updatedAt: string;
  /** Present when the list/detail endpoint includes relations. */
  site?: { id: string; name: string } | null;
  router?: {
    id: string;
    connectionStatus: string;
    signalStrength: number | null;
    operator?: string | null;
  } | null;
}

/** GET /cameras — backend cameraListQuerySchema. */
export interface CameraListQuery {
  page?: number;
  limit?: number;
  siteId?: string;
  /** Filter to one zone (camera → site → zone). Powers "/cameras?zone=<id>" deep-links. */
  zoneId?: string;
  routerId?: string;
  status?: CameraStatus;
  q?: string;
}

/** PATCH /cameras/:id — backend updateCameraSchema (partial create + maintenanceMode). */
export interface UpdateCameraInput {
  name?: string;
  maintenanceMode?: boolean;
}

/**
 * POST /cameras — backend createCameraSchema (CR-6, admin/engineer only).
 * RTSP secrets are plaintext in transit over TLS and encrypted at rest.
 */
export interface CreateCameraInput {
  siteId: string;
  routerId: string;
  cameraCode: string;
  name: string;
  brand?: string;
  model?: string;
  firmware?: string;
  serialNumber?: string;
  mainRtspUrl: string;
  subRtspUrl: string;
  rtspUsername: string;
  rtspPassword: string;
  onvifPort?: number;
  expectedCodec: string;
  expectedResolution: string;
  expectedFps: number;
  expectedBitrateKbps: number;
  latitude: number;
  longitude: number;
}

/** POST /cameras/test-connection — backend testCameraConnectionSchema (CR-6). */
export interface TestCameraConnectionInput {
  mainRtspUrl: string;
  rtspUsername: string;
  rtspPassword: string;
  cameraCode?: string;
  expectedCodec?: string;
  expectedResolution?: string;
  expectedFps?: number;
  expectedBitrateKbps?: number;
}

/** One probe stage of testCameraConnection (RTSP DESCRIBE or ffprobe frame). */
export interface ProbeStageResult {
  success: boolean;
  responseTimeMs?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  codec?: string | null;
  resolution?: string | null;
  fps?: number | null;
  bitrateKbps?: number | null;
}

/** testCameraConnection() response — nothing is persisted server-side. */
export interface TestConnectionResult {
  success: boolean;
  simMode: boolean;
  describe: ProbeStageResult;
  video: ProbeStageResult;
}

/** GET /routers list item — powers the add-camera modal's router select. */
export interface RouterItem {
  id: string;
  siteId: string;
  serialNumber: string;
  model: string;
  operator?: string;
  connectionStatus?: string;
}

/** One stage of the ROUTER_TCP → RTSP_PORT → RTSP_AUTH → VIDEO_VALIDATION pipeline. */
export interface PipelineStage {
  checkType: string;
  /** null = no result recorded for this stage yet. */
  success: boolean | null;
  responseTimeMs?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  codec?: string | null;
  resolution?: string | null;
  fps?: number | null;
  bitrateKbps?: number | null;
  startedAt?: string | null;
}

/** GET /cameras/:id/health — health.service.ts getCameraHealth(). */
export interface CameraHealthDetail {
  id: string;
  cameraCode: string;
  name: string;
  status: CameraStatus;
  healthScore: number;
  diagnosis: CameraDiagnosis | null;
  diagnosisText: string | null;
  lastHealthyAt: string | null;
  maintenanceMode: boolean;
  expectedCodec: string | null;
  expectedResolution: string | null;
  expectedFps: number | null;
  expectedBitrateKbps: number | null;
  site: { id: string; name: string } | null;
  router: {
    id: string;
    connectionStatus: string;
    signalStrength: number | null;
    operator: string | null;
  } | null;
  pipeline: PipelineStage[];
}

/** Raw HealthCheck row — GET /cameras/:id/health/checks. */
export interface HealthCheckRecord {
  id: string;
  cameraId: string;
  checkType: string;
  success: boolean;
  startedAt: string;
  responseTimeMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  codec: string | null;
  resolution: string | null;
  fps: number | null;
  bitrateKbps: number | null;
}

export interface CameraChecksQuery {
  cameraId: string;
  hours?: number;
  checkType?: string;
}

/** POST /cameras/:id/health/run — health.service.ts runCameraCheckNow(). */
export interface RunCheckResult {
  status?: CameraStatus;
  healthScore?: number;
  diagnosis: CameraDiagnosis | null;
  diagnosisText: string | null;
}

/** snapshot.service.ts SnapshotDto — file URLs are pre-signed relative paths. */
export interface SnapshotItem {
  id: string;
  cameraId: string;
  capturedAt: string;
  kind: 'SUB' | 'EVIDENCE';
  thumbUrl: string;
  originalUrl: string;
  brightnessScore: number | null;
  blurScore: number | null;
  freezeScore: number | null;
  obstructionScore: number | null;
  sceneShiftScore: number | null;
  dustScore: number | null;
  noiseScore: number | null;
  colorCastScore: number | null;
}

export interface CameraSnapshotsQuery {
  cameraId: string;
  hours?: number;
  kind?: 'SUB' | 'EVIDENCE';
  limit?: number;
}

/** GET /sites list item (hierarchy module) — used for the site filter. */
export interface SiteItem {
  id: string;
  zoneId: string;
  name: string;
  status?: string;
  address?: string | null;
}
