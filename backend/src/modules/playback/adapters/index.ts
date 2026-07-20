import type { CameraPlaybackAdapter, PlaybackAdapterKind } from './camera-playback.adapter.js';
import { OnvifGenericAdapter } from './onvif.adapter.js';
import { HikvisionAdapter } from './hikvision.adapter.js';
import { DahuaAdapter } from './dahua.adapter.js';

// ─────────────────────────────────────────────────────────────────────────────
// Factory — maps a camera's `playbackAdapter` column (prisma enum
// PlaybackAdapter: ONVIF_G | HIKVISION | DAHUA | NONE) to its vendor
// implementation. NONE (and null/undefined) fall back to ONVIF_G, the
// interoperable default — everything still proxies through MediaMTX either
// way (see buildProxyEndpoints).
// ─────────────────────────────────────────────────────────────────────────────

const onvif = new OnvifGenericAdapter();
const hikvision = new HikvisionAdapter();
const dahua = new DahuaAdapter();

export function getCameraPlaybackAdapter(
  kind: PlaybackAdapterKind | null | undefined
): CameraPlaybackAdapter {
  switch (kind) {
    case 'HIKVISION':
      return hikvision;
    case 'DAHUA':
      return dahua;
    case 'ONVIF_G':
    case 'NONE':
    default:
      return onvif;
  }
}

export type {
  AdapterCamera,
  AdapterCapabilities,
  CameraPlaybackAdapter,
  PlaybackAdapterKind,
  RecordingSegment,
} from './camera-playback.adapter.js';
export { OnvifGenericAdapter } from './onvif.adapter.js';
export { HikvisionAdapter } from './hikvision.adapter.js';
export { DahuaAdapter } from './dahua.adapter.js';
