import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Camera } from '@prisma/client';

// Real-mode env so publish/teardown exercise the control-plane path.
vi.mock('../../config/env.js', () => ({
  env: {
    PLAYBACK_SIM_MODE: false,
    MEDIAMTX_API_URL: 'http://mtx.test:9997',
    MEDIAMTX_HLS_URL: 'http://hls.test',
    MEDIAMTX_WEBRTC_URL: 'http://webrtc.test',
    MEDIAMTX_RTSP_URL: 'rtsp://rtsp.test',
  },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// decrypt() just strips an "enc:" marker so tests can assert the plaintext flow
// without real AES keys.
vi.mock('../../utils/encryption.js', () => ({
  decrypt: (payload: string) => payload.replace(/^enc:/, ''),
}));

import { publishStream, teardownStream, resolveCameraSource } from './mediamtx.adapter.js';

function makeCamera(overrides: Partial<Camera> = {}): Camera {
  return {
    mainRtspUrlEncrypted: 'enc:rtsp://cam.example/main',
    subRtspUrlEncrypted: 'enc:rtsp://cam.example/sub',
    rtspUsernameEncrypted: 'enc:admin',
    rtspPasswordEncrypted: 'enc:s3cr3t',
    expectedCodec: 'H.264',
    // What the health probe actually measured on the SUB stream (ffprobe emits
    // 'H264', no dot). This — not expectedCodec — drives the transcode decision.
    detectedSubCodec: 'H264',
    ...overrides,
  } as unknown as Camera;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveCameraSource', () => {
  it('injects credentials into a bare rtsp URL and uses the SUB stream for LIVE_SUB', () => {
    expect(resolveCameraSource(makeCamera(), 'LIVE_SUB')).toBe(
      'rtsp://admin:s3cr3t@cam.example/sub'
    );
  });

  it('uses the MAIN stream for LIVE_MAIN and PLAYBACK', () => {
    expect(resolveCameraSource(makeCamera(), 'LIVE_MAIN')).toBe(
      'rtsp://admin:s3cr3t@cam.example/main'
    );
    expect(resolveCameraSource(makeCamera(), 'PLAYBACK')).toBe(
      'rtsp://admin:s3cr3t@cam.example/main'
    );
  });

  it('injects userinfo into a path-cred URL (path tokens do NOT authenticate a Digest camera)', () => {
    // Legacy `…/user=x_password=y` path tokens are part of the request-URI, not
    // RTSP auth. MediaMTX/ffmpeg 401 without userinfo, so we inject the stored
    // creds; the path tokens stay intact. This is the live-wall/streaming fix.
    const embedded = 'enc:rtsp://192.0.2.10:554/user=admin_password=pw_channel=0';
    expect(resolveCameraSource(makeCamera({ subRtspUrlEncrypted: embedded }), 'LIVE_SUB')).toBe(
      'rtsp://admin:s3cr3t@192.0.2.10:554/user=admin_password=pw_channel=0'
    );
  });

  it('leaves a URL with rtsp://user:pass@ userinfo untouched', () => {
    const withUser = 'enc:rtsp://u:p@cam.example/sub';
    expect(resolveCameraSource(makeCamera({ subRtspUrlEncrypted: withUser }), 'LIVE_SUB')).toBe(
      'rtsp://u:p@cam.example/sub'
    );
  });

  it('normalizes an HTML-encoded ampersand (&amp;) in the stored URL back to a literal & (and injects creds)', () => {
    const encoded =
      'enc:rtsp://192.0.2.10:554/user=admin_password=pw_channel=1_stream=0&amp;onvif=0.sdp';
    expect(resolveCameraSource(makeCamera({ subRtspUrlEncrypted: encoded }), 'LIVE_SUB')).toBe(
      'rtsp://admin:s3cr3t@192.0.2.10:554/user=admin_password=pw_channel=1_stream=0&onvif=0.sdp'
    );
  });

  it('collapses accidental double-encoding (&amp;amp;) to a single & (and injects creds)', () => {
    const encoded =
      'enc:rtsp://192.0.2.10:554/user=admin_password=pw_channel=1_stream=0&amp;amp;onvif=0.sdp';
    expect(resolveCameraSource(makeCamera({ subRtspUrlEncrypted: encoded }), 'LIVE_SUB')).toBe(
      'rtsp://admin:s3cr3t@192.0.2.10:554/user=admin_password=pw_channel=1_stream=0&onvif=0.sdp'
    );
  });
});

describe('publishStream', () => {
  it('POSTs an on-demand path to the MediaMTX API with the resolved source', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await publishStream('live/live-sub/CAM-008/sess-1', makeCamera(), 'LIVE_SUB');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://mtx.test:9997/v3/config/paths/add/live/live-sub/CAM-008/sess-1');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      source: 'rtsp://admin:s3cr3t@cam.example/sub',
      sourceOnDemand: true,
    });
  });

  it('transcodes a non-H.264 (HEVC) LIVE_SUB source to H.264 via an on-demand ffmpeg command', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await publishStream(
      'live/live-sub/CAM-007/sess-1',
      makeCamera({ detectedSubCodec: 'HEVC' }),
      'LIVE_SUB'
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    // Not a plain pull — MediaMTX must run ffmpeg on demand instead.
    expect(body.source).toBeUndefined();
    expect(body.sourceOnDemand).toBeUndefined();
    expect(body.runOnDemand).toContain('ffmpeg');
    expect(body.runOnDemand).toContain('libx264'); // HEVC -> H.264
    expect(body.runOnDemand).toContain('scale=-2:360'); // downscaled sub tile
    expect(body.runOnDemand).toContain('rtsp://admin:s3cr3t@cam.example/sub'); // the resolved source
    expect(body.runOnDemand).toContain('rtsp://localhost:$RTSP_PORT/$MTX_PATH'); // republished back
    expect(body.runOnDemandRestart).toBe(true);
  });

  it('is DETECTION-AUTHORITATIVE: transcodes when the probe detected HEVC even though the operator declared expectedCodec H.264 (the exact production bug)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await publishStream(
      'live/live-sub/CAM-009/sess-1',
      makeCamera({ expectedCodec: 'H.264', detectedSubCodec: 'HEVC' }),
      'LIVE_SUB'
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.sourceOnDemand).toBeUndefined(); // NOT a passthrough pull
    expect(body.runOnDemand).toContain('libx264');
  });

  it('ignores expectedCodec in the safe direction too: a detected H264 (no dot) is passed through even when expectedCodec wrongly says HEVC', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await publishStream(
      'live/live-sub/CAM-010/sess-1',
      makeCamera({ expectedCodec: 'HEVC', detectedSubCodec: 'H264' }),
      'LIVE_SUB'
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      source: 'rtsp://admin:s3cr3t@cam.example/sub',
      sourceOnDemand: true,
    });
  });

  it('FAILS SAFE: transcodes a LIVE_SUB whose sub codec has not been probed yet (detectedSubCodec null)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await publishStream(
      'live/live-sub/CAM-011/sess-1',
      makeCamera({ detectedSubCodec: null }),
      'LIVE_SUB'
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.sourceOnDemand).toBeUndefined();
    expect(body.runOnDemand).toContain('libx264');
  });

  it('leaves an HEVC LIVE_MAIN stream as a plain HEVC pull (only the sub tile is transcoded)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await publishStream(
      'live/live-main/CAM-007/sess-1',
      makeCamera({ detectedSubCodec: 'HEVC' }),
      'LIVE_MAIN'
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      source: 'rtsp://admin:s3cr3t@cam.example/main',
      sourceOnDemand: true,
    });
  });

  it('throws a clear error when the MediaMTX API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(publishStream('live/x/CAM/s', makeCamera(), 'LIVE_SUB')).rejects.toThrow(
      /unreachable/i
    );
  });

  it('treats HTTP 400 (path already exists) as an idempotent success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    await expect(publishStream('live/x/CAM/s', makeCamera(), 'LIVE_SUB')).resolves.toBeUndefined();
  });

  it('throws on other non-2xx responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(publishStream('live/x/CAM/s', makeCamera(), 'LIVE_SUB')).rejects.toThrow(
      /HTTP 500/
    );
  });
});

describe('teardownStream', () => {
  it('DELETEs the MediaMTX path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    await teardownStream('live/live-sub/CAM-008/sess-1');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://mtx.test:9997/v3/config/paths/delete/live/live-sub/CAM-008/sess-1',
      { method: 'DELETE' }
    );
  });

  it('never throws even if the delete fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    await expect(teardownStream('live/x/CAM/s')).resolves.toBeUndefined();
  });
});
