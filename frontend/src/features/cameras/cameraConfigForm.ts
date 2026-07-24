import type {
  Camera,
  PlaybackAdapter,
  ConfigureCameraInput,
  UpdateCameraInput,
} from './cameras.types';
import { formatCoordinate, validateLatitude, validateLongitude } from './coordinates';

export const SELECT_CLASSES =
  'h-9 w-full rounded-lg border border-hairline bg-card px-3 text-sm text-ink transition-colors hover:border-sage focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage';

export const PLAYBACK_ADAPTERS: { value: PlaybackAdapter; label: string }[] = [
  { value: 'NONE', label: 'None (live only)' },
  { value: 'ONVIF_G', label: 'ONVIF (Profile G)' },
  { value: 'HIKVISION', label: 'Hikvision' },
  { value: 'DAHUA', label: 'Dahua' },
];

export interface CameraConfigFormState {
  name: string;
  siteId: string;
  routerId: string;
  mainRtspUrl: string;
  subRtspUrl: string;
  rtspUsername: string;
  rtspPassword: string;
  onvifPort: string;
  playbackAdapter: PlaybackAdapter;
  expectedCodec: string;
  expectedResolution: string;
  expectedFps: string;
  expectedBitrateKbps: string;
  latitude: string;
  longitude: string;
  snapshotIntervalMinutes: string;
}

export type PlacementValue = Pick<
  CameraConfigFormState,
  'siteId' | 'routerId' | 'latitude' | 'longitude'
>;
export type RtspValue = Pick<
  CameraConfigFormState,
  'mainRtspUrl' | 'subRtspUrl' | 'rtspUsername' | 'rtspPassword' | 'onvifPort'
>;
export type StreamSpecValue = Pick<
  CameraConfigFormState,
  'playbackAdapter' | 'expectedCodec' | 'expectedResolution' | 'expectedFps' | 'expectedBitrateKbps'
>;

export type ConfigFormErrors = Partial<Record<keyof CameraConfigFormState, string>>;

const numToStr = (n: number | null | undefined): string => (n != null ? String(n) : '');

/** Build editable form state from a sanitized Camera. RTSP secrets are ALWAYS
 * blank because the API strips them (sanitizeCamera); everything else prefills. */
export function configFormFromCamera(camera: Camera): CameraConfigFormState {
  return {
    name: camera.name,
    siteId: camera.siteId ?? '',
    routerId: camera.routerId ?? '',
    mainRtspUrl: '',
    subRtspUrl: '',
    rtspUsername: '',
    rtspPassword: '',
    onvifPort: numToStr(camera.onvifPort),
    playbackAdapter: camera.playbackAdapter,
    expectedCodec: camera.expectedCodec ?? '',
    expectedResolution: camera.expectedResolution ?? '',
    expectedFps: numToStr(camera.expectedFps),
    expectedBitrateKbps: numToStr(camera.expectedBitrateKbps),
    latitude: camera.latitude != null ? formatCoordinate(camera.latitude) : '',
    longitude: camera.longitude != null ? formatCoordinate(camera.longitude) : '',
    snapshotIntervalMinutes: String(camera.snapshotIntervalMinutes),
  };
}

const RTSP_URL_SHAPE = /^rtsps?:\/\/.+/i;

function boundedInt(value: string, min: number, max: number): boolean {
  const n = Number(value);
  return value.trim() !== '' && Number.isInteger(n) && n >= min && n <= max;
}

export function validateConfigForm(
  form: CameraConfigFormState,
  mode: 'create' | 'edit'
): ConfigFormErrors {
  const errors: ConfigFormErrors = {};

  if (!form.name.trim()) errors.name = 'Name is required';
  if (!form.siteId) errors.siteId = 'Site is required';
  if (!form.routerId) errors.routerId = 'Router is required';
  if (!form.expectedCodec.trim()) errors.expectedCodec = 'Codec is required';
  if (!form.expectedResolution.trim()) errors.expectedResolution = 'Resolution is required';

  const latErr = validateLatitude(form.latitude);
  if (latErr) errors.latitude = latErr;
  const lngErr = validateLongitude(form.longitude);
  if (lngErr) errors.longitude = lngErr;

  if (!boundedInt(form.expectedFps, 1, 240))
    errors.expectedFps = 'FPS must be a whole number 1–240';
  if (!boundedInt(form.expectedBitrateKbps, 1, 1_000_000))
    errors.expectedBitrateKbps = 'Bitrate must be 1–1,000,000 kbps';
  if (!boundedInt(form.snapshotIntervalMinutes, 1, 60))
    errors.snapshotIntervalMinutes = 'Snapshot interval must be 1–60 minutes';
  if (form.onvifPort.trim() && !boundedInt(form.onvifPort, 1, 65535))
    errors.onvifPort = 'ONVIF port must be 1–65535';

  const rtspRequired = mode === 'create';
  const checkUrl = (key: 'mainRtspUrl' | 'subRtspUrl', label: string): void => {
    const raw = form[key].trim();
    if (rtspRequired && !raw) errors[key] = `${label} is required`;
    else if (raw && !RTSP_URL_SHAPE.test(raw)) errors[key] = `${label} must be an rtsp:// URL`;
  };
  checkUrl('mainRtspUrl', 'Main RTSP URL');
  checkUrl('subRtspUrl', 'Sub RTSP URL');
  if (rtspRequired && !form.rtspUsername.trim()) errors.rtspUsername = 'Username is required';
  if (rtspRequired && !form.rtspPassword.trim()) errors.rtspPassword = 'Password is required';

  return errors;
}

/** Full, all-required configure payload (PUT /cameras/:id/configure). */
export function buildConfigureBody(form: CameraConfigFormState): ConfigureCameraInput {
  return {
    siteId: form.siteId,
    routerId: form.routerId,
    mainRtspUrl: form.mainRtspUrl.trim(),
    subRtspUrl: form.subRtspUrl.trim(),
    rtspUsername: form.rtspUsername,
    rtspPassword: form.rtspPassword,
    onvifPort: form.onvifPort.trim() ? Number(form.onvifPort) : undefined,
    playbackAdapter: form.playbackAdapter,
    expectedCodec: form.expectedCodec.trim(),
    expectedResolution: form.expectedResolution.trim(),
    expectedFps: Number(form.expectedFps),
    expectedBitrateKbps: Number(form.expectedBitrateKbps),
    latitude: Number(form.latitude),
    longitude: Number(form.longitude),
  };
}

/** Partial edit payload (PATCH /cameras/:id). Blank RTSP fields are OMITTED so
 * the server keeps the stored secret; never sends status/maintenanceMode. */
export function buildUpdateBody(form: CameraConfigFormState): UpdateCameraInput {
  const body: UpdateCameraInput = {
    name: form.name.trim(),
    siteId: form.siteId,
    routerId: form.routerId,
    playbackAdapter: form.playbackAdapter,
    expectedCodec: form.expectedCodec.trim(),
    expectedResolution: form.expectedResolution.trim(),
    expectedFps: Number(form.expectedFps),
    expectedBitrateKbps: Number(form.expectedBitrateKbps),
    latitude: Number(form.latitude),
    longitude: Number(form.longitude),
    snapshotIntervalMinutes: Number(form.snapshotIntervalMinutes),
  };
  if (form.onvifPort.trim()) body.onvifPort = Number(form.onvifPort);
  if (form.mainRtspUrl.trim()) body.mainRtspUrl = form.mainRtspUrl.trim();
  if (form.subRtspUrl.trim()) body.subRtspUrl = form.subRtspUrl.trim();
  if (form.rtspUsername.trim()) body.rtspUsername = form.rtspUsername;
  if (form.rtspPassword.trim()) body.rtspPassword = form.rtspPassword;
  return body;
}
