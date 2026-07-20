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
// Hikvision adapter (`PlaybackAdapter.HIKVISION`). SIM functional; real path
// builds the documented ISAPI RTSP track URI shape
// (rtsp://host/Streaming/tracks/{channel}01?starttime=...&endtime=...).
// Live ISAPI /ISAPI/ContentMgmt/search calls are Phase-2 (stub returns []).
// ─────────────────────────────────────────────────────────────────────────────

export class HikvisionAdapter implements CameraPlaybackAdapter {
  readonly vendor = 'HIKVISION' as const;

  describe(): AdapterCapabilities {
    return {
      vendor: this.vendor,
      supportsRecordingQuery: true,
      supportsAbsoluteSeek: true,
      notes:
        'Hikvision ISAPI — RTSP /Streaming/tracks/{ch}01 replay URIs + ContentMgmt/search (SIM synthesizes segments; live ISAPI is Phase-2).',
    };
  }

  buildVendorPlaybackUri(camera: AdapterCamera, start: Date, end: Date): string {
    const channel = camera.channel ?? 1;
    return `rtsp://${rtspHost(camera)}/Streaming/tracks/${channel}01?starttime=${vendorTimestamp(start)}&endtime=${vendorTimestamp(end)}`;
  }

  async listRecordingSegments(
    camera: AdapterCamera,
    start: Date,
    end: Date
  ): Promise<RecordingSegment[]> {
    if (isSimMode()) return simRecordingSegments(camera, start, end, this.vendor);
    // Phase-2: POST /ISAPI/ContentMgmt/search (CMSearchDescription XML).
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
