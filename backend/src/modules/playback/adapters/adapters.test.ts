import { describe, expect, it, vi } from 'vitest';
import {
  DahuaAdapter,
  HikvisionAdapter,
  OnvifGenericAdapter,
  getCameraPlaybackAdapter,
} from './index.js';
import type { AdapterCamera } from './index.js';
import { simRecordingSegments, vendorTimestamp } from './camera-playback.adapter.js';
import * as cameraPlayback from './camera-playback.adapter.js';

// CR-12 — vendor playback adapter layer: factory routing, SIM segment
// synthesis, vendor URI shapes and proxy endpoint plumbing.

const camera: AdapterCamera = {
  cameraCode: 'CAM-GGN-021',
  mainRtspUrl: 'rtsp://admin:secret@10.20.40.11:554/stream1',
  onvifPort: 8000,
  channel: 2,
};

const start = new Date('2026-07-01T10:30:00.000Z');
const end = new Date('2026-07-01T12:15:00.000Z');

describe('getCameraPlaybackAdapter', () => {
  it('routes each enum value to its vendor implementation', () => {
    expect(getCameraPlaybackAdapter('HIKVISION')).toBeInstanceOf(HikvisionAdapter);
    expect(getCameraPlaybackAdapter('DAHUA')).toBeInstanceOf(DahuaAdapter);
    expect(getCameraPlaybackAdapter('ONVIF_G')).toBeInstanceOf(OnvifGenericAdapter);
    // NONE / null fall back to the interoperable ONVIF default.
    expect(getCameraPlaybackAdapter('NONE')).toBeInstanceOf(OnvifGenericAdapter);
    expect(getCameraPlaybackAdapter(null)).toBeInstanceOf(OnvifGenericAdapter);
  });

  it('every adapter reports capabilities for its own vendor', () => {
    for (const kind of ['ONVIF_G', 'HIKVISION', 'DAHUA'] as const) {
      const caps = getCameraPlaybackAdapter(kind).describe();
      expect(caps.vendor).toBe(kind);
      expect(caps.supportsRecordingQuery).toBe(true);
      expect(caps.notes.length).toBeGreaterThan(10);
    }
  });
});

describe('vendor playback URIs', () => {
  it('hikvision builds ISAPI track URIs with host extracted from the RTSP url', () => {
    const uri = new HikvisionAdapter().buildVendorPlaybackUri(camera, start, end);
    expect(uri).toBe(
      'rtsp://10.20.40.11:554/Streaming/tracks/201?starttime=20260701T103000Z&endtime=20260701T121500Z'
    );
  });

  it('dahua builds cam/playback URIs with the channel number', () => {
    const uri = new DahuaAdapter().buildVendorPlaybackUri(camera, start, end);
    expect(uri).toContain('rtsp://10.20.40.11:554/cam/playback?channel=2');
    expect(uri).toContain('starttime=20260701T103000Z');
  });

  it('onvif builds replay URIs on the onvif port and survives a missing RTSP url', () => {
    const uri = new OnvifGenericAdapter().buildVendorPlaybackUri(camera, start, end);
    expect(uri).toContain('onvif-replay://10.20.40.11:554:8000/Recording/CAM-GGN-021');
    const bare = new OnvifGenericAdapter().buildVendorPlaybackUri(
      { cameraCode: 'CAM-X' },
      start,
      end
    );
    expect(bare).toContain('sim-CAM-X.local');
  });
});

describe('SIM recording segments', () => {
  it('synthesizes hour-aligned segments covering the range, deterministically', async () => {
    // Force SIM mode for this case so it exercises hour-aligned synthesis regardless
    // of the ambient .env. Production sets PLAYBACK_SIM_MODE=false and the real adapter
    // correctly returns [] until the vendor recording-search query is implemented.
    vi.spyOn(cameraPlayback, 'isSimMode').mockReturnValue(true);
    const adapter = getCameraPlaybackAdapter('HIKVISION');
    const segments = await adapter.listRecordingSegments(camera, start, end);
    // 10:30–11:00, 11:00–12:00, 12:00–12:15
    expect(segments).toHaveLength(3);
    expect(segments[0]?.start.toISOString()).toBe('2026-07-01T10:30:00.000Z');
    expect(segments[0]?.end.toISOString()).toBe('2026-07-01T11:00:00.000Z');
    expect(segments[2]?.end.toISOString()).toBe('2026-07-01T12:15:00.000Z');
    expect(segments[0]?.uri).toBe(
      `sim://hikvision/CAM-GGN-021/${vendorTimestamp(segments[0]!.start)}-${vendorTimestamp(segments[0]!.end)}`
    );
    // Re-running produces the identical answer (drills rely on determinism).
    const again = await adapter.listRecordingSegments(camera, start, end);
    expect(again).toEqual(segments);
  });

  it('returns [] for an empty/inverted range', () => {
    expect(simRecordingSegments(camera, end, start, 'DAHUA')).toEqual([]);
  });
});

describe('proxy endpoints', () => {
  it('resolves same-origin signed media endpoints and never leaks MediaMTX/creds', () => {
    const eps = getCameraPlaybackAdapter('DAHUA').buildProxyEndpoints(camera, 'sess-1');
    expect(eps.mediamtxPath).toContain('/playback/CAM-GGN-021/sess-1');
    // Clean, same-origin /media/* paths. The HMAC token is NOT in the URL — it
    // rides an HttpOnly, path-scoped cookie (set on session start) so it never
    // lands in nginx/proxy access logs, Referer headers, or the browser history.
    expect(eps.hlsUrl).toContain(`/media/hls/${eps.mediamtxPath}/index.m3u8`);
    expect(eps.webrtcUrl).toContain(`/media/webrtc/${eps.mediamtxPath}/whep`);
    // No token material (exp/sig) leaks into either browser-facing URL.
    expect(eps.hlsUrl).not.toMatch(/[?&](?:exp|sig)=/);
    expect(eps.webrtcUrl).not.toMatch(/[?&](?:exp|sig)=/);
    // RTSP is never surfaced to the browser.
    expect(eps.rtspUrl).toBe('');
    // No MediaMTX localhost URL or camera credentials leak into the browser DTO.
    expect(eps.hlsUrl).not.toMatch(/localhost|rtsp:|admin:secret/);
    expect(eps.webrtcUrl).not.toMatch(/localhost|rtsp:|admin:secret/);
  });
});
