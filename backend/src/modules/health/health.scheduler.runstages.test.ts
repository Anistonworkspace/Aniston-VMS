import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckResult } from './health.checkers.js';
import type { ConfiguredCameraWithRouter } from './health.scheduler.js';

// Regression coverage for the CAMERA-FIRST probe reorder in runStages.
//
// Bug: the pipeline hard-gated every camera on a TCP probe to the router's
// HTTPS *management* port (publicStaticIp:managementPort). That port is almost
// always firewalled off the WAN and its IP can be stale on CGNAT/DDNS links, so
// a camera whose RTSP stream was perfectly reachable (and playable in VLC) got
// all downstream stages SKIPPED and the site mislabelled SITE_INTERNET_DOWN.
//
// Fix: probe the camera's own RTSP endpoint first — if it answers, the path
// through the router is provably up, so the router management probe is skipped
// and its result synthesized as success. The router is only probed (for the
// SITE_INTERNET_DOWN-vs-CAMERA_OFFLINE label) when the camera is unreachable.

const CAMERA_HOST = '122.180.29.77';
const ROUTER_IP = '49.36.10.11';
const ROUTER_MGMT_PORT = 8443;

// Import-time isolation (mirrors health.scheduler.test.ts): keep live Redis /
// Prisma / incident-engine handles out of this unit.
vi.mock('../../lib/prisma.js', () => ({ prisma: { camera: { findMany: vi.fn() } } }));
vi.mock('../../lib/redis.js', () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
  bullConnection: { host: 'localhost', port: 6379 },
}));
vi.mock('../incidents/incident.service.js', () => ({ onHealthOutcome: vi.fn() }));

// Probe primitives + crypto + adapter are the seams runStages calls out to.
vi.mock('../../utils/encryption.js', () => ({ decrypt: vi.fn((s: string) => s) }));
vi.mock('../playback/mediamtx.adapter.js', () => ({
  resolveCameraSource: vi.fn(() => `rtsp://${CAMERA_HOST}/sub`),
}));
vi.mock('./health.checkers.js', () => ({
  tcpProbe: vi.fn(),
  rtspDescribe: vi.fn(),
  ffprobeStream: vi.fn(),
  getSimFault: vi.fn(),
  simulateStages: vi.fn(),
}));

const checkers = await import('./health.checkers.js');
const { runStages } = await import('./health.scheduler.js');

const ok = (over: Partial<CheckResult> = {}): CheckResult => ({
  success: true,
  responseTimeMs: 12,
  ...over,
});
const timeout = (): CheckResult => ({
  success: false,
  responseTimeMs: 3000,
  errorCode: 'TIMEOUT',
  errorMessage: 'timed out',
});

const cam = {
  id: 'cam-1',
  cameraCode: 'CAM-001',
  siteId: 'site-1',
  mainRtspUrlEncrypted: `rtsp://${CAMERA_HOST}/user=admin_password=x_channel=1_stream=0&onvif=0.sdp`,
  rtspUsernameEncrypted: 'admin',
  rtspPasswordEncrypted: 'x',
  expectedCodec: 'h264',
  expectedResolution: '1920x1080',
  expectedFps: 15,
  expectedBitrateKbps: 2048,
  router: { publicStaticIp: ROUTER_IP, managementPort: ROUTER_MGMT_PORT, signalStrength: -60 },
} as unknown as ConfiguredCameraWithRouter;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkers.getSimFault).mockResolvedValue(null);
  vi.mocked(checkers.rtspDescribe).mockResolvedValue(ok());
  vi.mocked(checkers.ffprobeStream).mockResolvedValue(ok({ codec: 'h264' }));
});

const routerWasProbed = (): boolean =>
  vi.mocked(checkers.tcpProbe).mock.calls.some(([host]) => host === ROUTER_IP);

describe('runStages — camera-first probe order', () => {
  it('reports a reachable camera healthy WITHOUT probing (or gating on) the router mgmt port', async () => {
    // Camera answers; router mgmt port would time out — the old code SKIPPED
    // everything and flagged SITE_INTERNET_DOWN. It must not even be consulted.
    vi.mocked(checkers.tcpProbe).mockImplementation((host: string) =>
      Promise.resolve(host === CAMERA_HOST ? ok() : timeout())
    );

    const { staged } = await runStages(cam);

    expect(staged.rtspPort.success).toBe(true);
    expect(staged.rtspAuth.success).toBe(true);
    expect(staged.video.success).toBe(true);
    // Router result is synthesized success from camera reachability, so
    // diagnose() never enters its Stage-1 "router unreachable" branch.
    expect(staged.routerTcp.success).toBe(true);
    // The (firewalled) management port is never touched on the healthy path.
    expect(routerWasProbed()).toBe(false);
  });

  it('probes the router mgmt port ONLY when the camera is unreachable (for the diagnosis label)', async () => {
    vi.useFakeTimers();
    vi.mocked(checkers.tcpProbe).mockResolvedValue(timeout()); // camera + router both down

    const p = runStages(cam);
    await vi.runAllTimersAsync(); // drain withRetry's backoff delays
    const { staged } = await p;
    vi.useRealTimers();

    expect(staged.rtspPort.success).toBe(false);
    expect(staged.routerTcp.success).toBe(false); // real mgmt-port result feeds SITE_INTERNET_DOWN
    expect(staged.rtspAuth.errorCode).toBe('SKIPPED');
    expect(staged.video.errorCode).toBe('SKIPPED');
    expect(routerWasProbed()).toBe(true);
    // Auth is never attempted against an unreachable camera.
    expect(checkers.rtspDescribe).not.toHaveBeenCalled();
  });
});
