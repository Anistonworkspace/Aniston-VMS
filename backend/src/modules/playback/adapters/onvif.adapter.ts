import type {
  AdapterCamera,
  AdapterCapabilities,
  CameraPlaybackAdapter,
  RecordingSegment,
} from './camera-playback.adapter.js';
import {
  isSimMode,
  proxyEndpoints,
  rtspHost,
  simRecordingSegments,
  vendorTimestamp,
} from './camera-playback.adapter.js';
import type { StreamEndpoints, StreamKind } from '../mediamtx.adapter.js';

// ─────────────────────────────────────────────────────────────────────────────
// ONVIF Profile G adapter (`PlaybackAdapter.ONVIF_G`). SIM functional; the
// real path builds the ONVIF replay URI shape (RTSP w/ ReplayUri semantics —
// see ONVIF Streaming Spec §Replay). Live SOAP GetRecordings/GetReplayUri
// calls are Phase-2 (stub returns [], compiles without network).
// ─────────────────────────────────────────────────────────────────────────────

export class OnvifGenericAdapter implements CameraPlaybackAdapter {
  readonly vendor = 'ONVIF_G' as const;

  describe(): AdapterCapabilities {
    return {
      vendor: this.vendor,
      supportsRecordingQuery: true,
      supportsAbsoluteSeek: true,
      notes:
        'ONVIF Profile G replay — GetRecordings/GetReplayUri over SOAP (SIM synthesizes segments; live SOAP is Phase-2).',
    };
  }

  buildVendorPlaybackUri(camera: AdapterCamera, start: Date, end: Date): string {
    // ONVIF replay: RTSP URI from GetReplayUri + Range header on PLAY.
    // Deterministic shape (onvif-replay scheme keeps it self-describing).
    const port = camera.onvifPort ?? 80;
    return `onvif-replay://${rtspHost(camera)}:${port}/Recording/${camera.cameraCode}?starttime=${vendorTimestamp(start)}&endtime=${vendorTimestamp(end)}`;
  }

  async listRecordingSegments(
    camera: AdapterCamera,
    start: Date,
    end: Date
  ): Promise<RecordingSegment[]> {
    if (isSimMode()) return simRecordingSegments(camera, start, end, this.vendor);
    // Phase-2: SOAP FindRecordings/GetRecordingSearchResults against
    // http://host:{onvifPort}/onvif/device_service. Compiles, no I/O.
    return [];
  }

  buildProxyEndpoints(
    camera: AdapterCamera,
    sessionId: string,
    kind: StreamKind = 'PLAYBACK'
  ): StreamEndpoints {
    return proxyEndpoints(camera, sessionId, kind);
  }
}
