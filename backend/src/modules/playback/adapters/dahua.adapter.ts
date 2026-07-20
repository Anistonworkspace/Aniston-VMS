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
// Dahua adapter (`PlaybackAdapter.DAHUA`). SIM functional; real path builds
// the documented Dahua playback RTSP URI shape
// (rtsp://host/cam/playback?channel={ch}&starttime=...&endtime=...).
// Live RPC2 mediaFileFind calls are Phase-2 (stub returns []).
// ─────────────────────────────────────────────────────────────────────────────

export class DahuaAdapter implements CameraPlaybackAdapter {
  readonly vendor = 'DAHUA' as const;

  describe(): AdapterCapabilities {
    return {
      vendor: this.vendor,
      supportsRecordingQuery: true,
      supportsAbsoluteSeek: false,
      notes:
        'Dahua — RTSP /cam/playback replay URIs + RPC2 mediaFileFind (SIM synthesizes segments; live RPC2 is Phase-2).',
    };
  }

  buildVendorPlaybackUri(camera: AdapterCamera, start: Date, end: Date): string {
    const channel = camera.channel ?? 1;
    return `rtsp://${rtspHost(camera)}/cam/playback?channel=${channel}&starttime=${vendorTimestamp(start)}&endtime=${vendorTimestamp(end)}`;
  }

  async listRecordingSegments(
    camera: AdapterCamera,
    start: Date,
    end: Date
  ): Promise<RecordingSegment[]> {
    if (isSimMode()) return simRecordingSegments(camera, start, end, this.vendor);
    // Phase-2: RPC2 factory.create MediaFileFind → findFile/findNextFile.
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
