import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as EnvModule from '../../config/env.js';

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2c — the register → configure → activate → deactivate lifecycle on
// camera.service. These four methods are the whole point of the registration /
// configuration split, so the tests prove the invariants that make the split
// safe:
//   • register writes IDENTITY ONLY (no site, no stream config, no secrets);
//   • configure never changes provisioningState (activation is a separate gate);
//   • activate RE-RUNS the connection test against the STORED, decrypted config
//     and only flips DRAFT → CONFIGURED when that server-run test passes;
//   • deactivate retains config but resets health, and every hop is audited.
// ─────────────────────────────────────────────────────────────────────────────

// --- Prisma mock ------------------------------------------------------------
const prismaMock = {
  camera: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(), // findCameraOrThrow — server-loads `before`
  },
  router: {
    findUnique: vi.fn(), // assertRouterBelongsToSite
  },
  auditLog: {
    create: vi.fn(), //    best-effort audit (global client)
  },
};
vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));

// --- Scope mock -------------------------------------------------------------
// Scope math lives in lib/scope.test.ts; here canAccessCamera / canAccessSite
// are opaque booleans so a test can force in/out-of-scope decisions directly.
const getUserScopeMock = vi.fn();
const canAccessCameraMock = vi.fn();
const canAccessSiteMock = vi.fn();
vi.mock('../../lib/scope.js', () => ({
  getUserScope: getUserScopeMock,
  canAccessCamera: canAccessCameraMock,
  canAccessSite: canAccessSiteMock,
  cameraScopeWhere: vi.fn(() => ({ __scope: true })),
}));

// --- Encryption mock --------------------------------------------------------
// Reversible, inspectable stand-ins so tests can PROVE (a) configure encrypts
// every credential before it is stored, and (b) activate DECRYPTS the stored
// config before handing it to the connection test.
vi.mock('../../utils/encryption.js', () => ({
  encrypt: vi.fn((s: string) => `enc:${s}`),
  decrypt: vi.fn((s: string) => (s.startsWith('enc:') ? s.slice(4) : s)),
}));

// --- Health-checker mock ----------------------------------------------------
// activate's authoritative gate runs testCameraConnection → rtspDescribe +
// ffprobeStream. Mock them so the probe outcome is deterministic (and no real
// network / ffprobe is touched). env is forced out of sim mode below so the
// real-probe branch (which is what decrypts the stored URL) is exercised.
const rtspDescribeMock = vi.fn();
const ffprobeStreamMock = vi.fn();
vi.mock('../health/health.checkers.js', () => ({
  rtspDescribe: rtspDescribeMock,
  ffprobeStream: ffprobeStreamMock,
  getSimFault: vi.fn(),
  simulateStages: vi.fn(),
}));

vi.mock('../../config/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();
  return { ...actual, env: { ...actual.env, HEALTH_SIM_MODE: false } };
});

const { registerCamera, configureCamera, activateCamera, deactivateCamera, testCameraConnection } =
  await import('./camera.service.js');
const { ConflictError, ForbiddenError, NotFoundError, ValidationError } =
  await import('../../middleware/errorHandler.js');

const actor = { id: 'user-1', role: 'PROJECT_ADMIN' as const, email: 'admin@example.com' };
const reqStub = { ip: '10.0.0.9' } as unknown as Request;
const allScope = { userId: 'user-1', all: true };

// The 6 encrypted/hash credential fields sanitizeCamera must strip from every
// value it returns or audits.
const SECRET_FIELDS = [
  'mainRtspUrlEncrypted',
  'subRtspUrlEncrypted',
  'rtspUsernameEncrypted',
  'rtspPasswordEncrypted',
  'mainRtspHash',
  'subRtspHash',
] as const;

// A freshly registered DRAFT camera: identity only, everything else NULL.
const draftRow = {
  id: 'cam-1',
  siteId: null,
  routerId: null,
  cameraCode: 'CAM-042',
  name: 'Front Door',
  brand: 'Axis',
  model: 'P3245',
  firmware: '10.12',
  serialNumber: 'SN-1',
  mainRtspUrlEncrypted: null,
  subRtspUrlEncrypted: null,
  mainRtspHash: null,
  subRtspHash: null,
  rtspUsernameEncrypted: null,
  rtspPasswordEncrypted: null,
  onvifPort: null,
  playbackAdapter: 'NONE',
  expectedCodec: null,
  expectedResolution: null,
  expectedFps: null,
  expectedBitrateKbps: null,
  latitude: null,
  longitude: null,
  provisioningState: 'DRAFT',
  status: 'UNKNOWN',
  diagnosis: null,
};

// A fully-configured DRAFT camera — every column activate's gate requires is
// present. Encrypted blobs use the `enc:` convention so decrypt() reverses them.
const configuredDraftRow = {
  ...draftRow,
  siteId: 'site-1',
  routerId: 'router-1',
  mainRtspUrlEncrypted: 'enc:rtsp://main.example/stream',
  subRtspUrlEncrypted: 'enc:rtsp://sub.example/stream',
  mainRtspHash: 'hash-main',
  subRtspHash: 'hash-sub',
  rtspUsernameEncrypted: 'enc:operator',
  rtspPasswordEncrypted: 'enc:s3cret',
  onvifPort: 80,
  expectedCodec: 'H.264',
  expectedResolution: '1920x1080',
  expectedFps: 15,
  expectedBitrateKbps: 2048,
  latitude: 25.2,
  longitude: 55.3,
};

const configureInput = {
  siteId: 'site-1',
  routerId: 'router-1',
  mainRtspUrl: 'rtsp://main.example/stream',
  subRtspUrl: 'rtsp://sub.example/stream',
  rtspUsername: 'operator',
  rtspPassword: 's3cret',
  onvifPort: 80,
  playbackAdapter: 'NONE' as const,
  expectedCodec: 'H.264',
  expectedResolution: '1920x1080',
  expectedFps: 15,
  expectedBitrateKbps: 2048,
  latitude: 25.2,
  longitude: 55.3,
};

const passingProbe = { success: true, responseTimeMs: 40, errorCode: null, errorMessage: null };

beforeEach(() => {
  vi.clearAllMocks();
  getUserScopeMock.mockResolvedValue(allScope);
  canAccessCameraMock.mockResolvedValue(true);
  canAccessSiteMock.mockResolvedValue(true);
  prismaMock.auditLog.create.mockResolvedValue({});
  prismaMock.router.findUnique.mockResolvedValue({ siteId: 'site-1' });
  rtspDescribeMock.mockResolvedValue(passingProbe);
  ffprobeStreamMock.mockResolvedValue(passingProbe);
});

// ── register ────────────────────────────────────────────────────────────────
describe('registerCamera — identity-only DRAFT create', () => {
  it('creates with ONLY identity fields — no site, router, stream config, or state', async () => {
    prismaMock.camera.create.mockResolvedValue(draftRow);

    await registerCamera(
      {
        cameraCode: 'CAM-042',
        name: 'Front Door',
        brand: 'Axis',
        model: 'P3245',
        firmware: '10.12',
        serialNumber: 'SN-1',
      } as Parameters<typeof registerCamera>[0],
      actor,
      reqStub
    );

    const data = prismaMock.camera.create.mock.calls[0]![0]!.data;
    expect(data).toMatchObject({ cameraCode: 'CAM-042', name: 'Front Door', brand: 'Axis' });
    // No placement, no stream config, no manual state override — DRAFT/UNKNOWN
    // come from the schema defaults, not from the service.
    for (const forbidden of [
      'siteId',
      'routerId',
      'mainRtspUrlEncrypted',
      'rtspPasswordEncrypted',
      'expectedCodec',
      'latitude',
      'provisioningState',
      'status',
    ]) {
      expect(data).not.toHaveProperty(forbidden);
    }
  });

  it('does NOT check site scope (a DRAFT camera has no site to scope against)', async () => {
    prismaMock.camera.create.mockResolvedValue(draftRow);

    await registerCamera(
      { cameraCode: 'CAM-042', name: 'Front Door' } as Parameters<typeof registerCamera>[0],
      actor,
      reqStub
    );

    expect(canAccessSiteMock).not.toHaveBeenCalled();
  });

  it('audits camera.register with a sanitized, secret-free newValue', async () => {
    prismaMock.camera.create.mockResolvedValue(draftRow);

    const safe = await registerCamera(
      { cameraCode: 'CAM-042', name: 'Front Door' } as Parameters<typeof registerCamera>[0],
      actor,
      reqStub
    );

    const auditData = prismaMock.auditLog.create.mock.calls[0]![0]!.data;
    expect(auditData).toMatchObject({
      action: 'camera.register',
      entityType: 'Camera',
      entityId: 'cam-1',
      userId: 'user-1',
    });
    for (const field of SECRET_FIELDS) expect(safe).not.toHaveProperty(field);
  });
});

// ── configure ─────────────────────────────────────────────────────────────
describe('configureCamera — placement + stream config, state-preserving', () => {
  it('ForbiddenError when the TARGET site is outside the caller scope (no write)', async () => {
    prismaMock.camera.findUnique.mockResolvedValue(draftRow);
    canAccessSiteMock.mockResolvedValue(false);

    await expect(configureCamera('cam-1', configureInput, actor, reqStub)).rejects.toBeInstanceOf(
      ForbiddenError
    );
    expect(prismaMock.camera.update).not.toHaveBeenCalled();
  });

  it('ValidationError when the router does not belong to the target site (no write)', async () => {
    prismaMock.camera.findUnique.mockResolvedValue(draftRow);
    prismaMock.router.findUnique.mockResolvedValue({ siteId: 'other-site' });

    await expect(configureCamera('cam-1', configureInput, actor, reqStub)).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(prismaMock.camera.update).not.toHaveBeenCalled();
  });

  it('NotFoundError when the camera does not exist (no write)', async () => {
    prismaMock.camera.findUnique.mockResolvedValue(null);

    await expect(configureCamera('missing', configureInput, actor, reqStub)).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(prismaMock.camera.update).not.toHaveBeenCalled();
  });

  it('encrypts every credential + hashes the URLs, but NEVER changes provisioningState', async () => {
    prismaMock.camera.findUnique.mockResolvedValue(draftRow);
    prismaMock.camera.update.mockResolvedValue(configuredDraftRow);

    await configureCamera('cam-1', configureInput, actor, reqStub);

    const data = prismaMock.camera.update.mock.calls[0]![0]!.data;
    // Credentials stored encrypted (never plaintext) …
    expect(data.mainRtspUrlEncrypted).toBe('enc:rtsp://main.example/stream');
    expect(data.subRtspUrlEncrypted).toBe('enc:rtsp://sub.example/stream');
    expect(data.rtspUsernameEncrypted).toBe('enc:operator');
    expect(data.rtspPasswordEncrypted).toBe('enc:s3cret');
    // Every credential column is the encrypt() output, never the raw plaintext
    // (the reversible `enc:` mock stands in for AES-256-GCM here).
    expect(data.rtspPasswordEncrypted).not.toBe('s3cret');
    expect(data.mainRtspUrlEncrypted).not.toBe('rtsp://main.example/stream');
    // Dedupe hashes are written, placement is saved …
    expect(data.mainRtspHash).toBeTruthy();
    expect(data.siteId).toBe('site-1');
    expect(data.latitude).toBe(25.2);
    // … but activation is a SEPARATE gate: configure never touches the state.
    expect(data).not.toHaveProperty('provisioningState');
  });

  it('audits camera.configure with old+new sanitized snapshots and the target siteId', async () => {
    prismaMock.camera.findUnique.mockResolvedValue(draftRow);
    prismaMock.camera.update.mockResolvedValue(configuredDraftRow);

    await configureCamera('cam-1', configureInput, actor, reqStub);

    const auditData = prismaMock.auditLog.create.mock.calls[0]![0]!.data;
    expect(auditData).toMatchObject({
      action: 'camera.configure',
      entityType: 'Camera',
      entityId: 'cam-1',
      siteId: 'site-1',
    });
    for (const field of SECRET_FIELDS) {
      expect(auditData.oldValue).not.toHaveProperty(field);
      expect(auditData.newValue).not.toHaveProperty(field);
    }
  });
});

// ── activate ────────────────────────────────────────────────────────────────
describe('activateCamera — server-run test gate for DRAFT → CONFIGURED', () => {
  it('ConflictError (409) re-activating a CONFIGURED camera — before running any probe', async () => {
    prismaMock.camera.findUnique.mockResolvedValue({
      ...configuredDraftRow,
      provisioningState: 'CONFIGURED',
    });

    await expect(activateCamera('cam-1', actor, reqStub)).rejects.toBeInstanceOf(ConflictError);
    expect(rtspDescribeMock).not.toHaveBeenCalled();
    expect(ffprobeStreamMock).not.toHaveBeenCalled();
    expect(prismaMock.camera.update).not.toHaveBeenCalled();
  });

  it('ValidationError when a DRAFT camera has incomplete config (no probe, no flip)', async () => {
    prismaMock.camera.findUnique.mockResolvedValue(draftRow); // config all NULL

    await expect(activateCamera('cam-1', actor, reqStub)).rejects.toBeInstanceOf(ValidationError);
    expect(rtspDescribeMock).not.toHaveBeenCalled();
    expect(prismaMock.camera.update).not.toHaveBeenCalled();
  });

  it('runs the probe against the DECRYPTED stored config (never a client-supplied one)', async () => {
    prismaMock.camera.findUnique.mockResolvedValue(configuredDraftRow);
    prismaMock.camera.update.mockResolvedValue({
      ...configuredDraftRow,
      provisioningState: 'CONFIGURED',
    });

    await activateCamera('cam-1', actor, reqStub);

    // The stored, encrypted URL/creds are decrypted before the probe sees them.
    expect(rtspDescribeMock).toHaveBeenCalledWith(
      'rtsp://main.example/stream',
      'operator',
      's3cret'
    );
  });

  it('flips DRAFT → CONFIGURED and audits camera.activate when the probe PASSES', async () => {
    prismaMock.camera.findUnique.mockResolvedValue(configuredDraftRow);
    prismaMock.camera.update.mockResolvedValue({
      ...configuredDraftRow,
      provisioningState: 'CONFIGURED',
    });

    const result = await activateCamera('cam-1', actor, reqStub);

    expect(result.activated).toBe(true);
    expect(result.test.success).toBe(true);
    expect(prismaMock.camera.update.mock.calls[0]![0]!.data).toEqual({
      provisioningState: 'CONFIGURED',
    });
    expect(prismaMock.auditLog.create.mock.calls[0]![0]!.data).toMatchObject({
      action: 'camera.activate',
      entityId: 'cam-1',
      siteId: 'site-1',
    });
  });

  it('does NOT flip (stays DRAFT) and does NOT audit when the probe FAILS', async () => {
    prismaMock.camera.findUnique.mockResolvedValue(configuredDraftRow);
    ffprobeStreamMock.mockResolvedValue({
      success: false,
      responseTimeMs: 0,
      errorCode: 'WRONG_RESOLUTION',
      errorMessage: 'nope',
    });

    const result = await activateCamera('cam-1', actor, reqStub);

    expect(result.activated).toBe(false);
    expect(result.test.success).toBe(false);
    expect(result.camera.provisioningState).toBe('DRAFT');
    expect(prismaMock.camera.update).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });
});

// ── deactivate ────────────────────────────────────────────────────────────
describe('deactivateCamera — CONFIGURED → DRAFT, config retained', () => {
  it('ConflictError (409) deactivating a camera that is already DRAFT (no write)', async () => {
    prismaMock.camera.findUnique.mockResolvedValue(configuredDraftRow); // DRAFT

    await expect(deactivateCamera('cam-1', actor, reqStub)).rejects.toBeInstanceOf(ConflictError);
    expect(prismaMock.camera.update).not.toHaveBeenCalled();
  });

  it('resets state + health but RETAINS the stream config, and audits the hop', async () => {
    prismaMock.camera.findUnique.mockResolvedValue({
      ...configuredDraftRow,
      provisioningState: 'CONFIGURED',
    });
    prismaMock.camera.update.mockResolvedValue(configuredDraftRow);

    await deactivateCamera('cam-1', actor, reqStub);

    const data = prismaMock.camera.update.mock.calls[0]![0]!.data;
    expect(data.provisioningState).toBe('DRAFT');
    expect(data.status).toBe('UNKNOWN');
    expect(data.diagnosis).toBeNull();
    // Config is deliberately NOT cleared — the camera can be re-activated later
    // without re-entering everything.
    expect(data).not.toHaveProperty('siteId');
    expect(data).not.toHaveProperty('mainRtspUrlEncrypted');

    expect(prismaMock.auditLog.create.mock.calls[0]![0]!.data).toMatchObject({
      action: 'camera.deactivate',
      entityId: 'cam-1',
    });
  });
});

// ── testCameraConnection — real-probe credential injection ────────────────────
// Regression: prod cameras store creds in the separate rtspUsername/rtspPassword
// fields and use a legacy path-cred URL. rtspDescribe authenticates via Digest,
// but ffprobe can ONLY auth with creds in the URL userinfo. The endpoint used to
// hand ffprobe the raw URL → 401 → "ffprobe exit 1" for every real camera.
describe('testCameraConnection — real (non-sim) probe', () => {
  it('injects the stored credentials into the URL handed to ffprobe (path-cred digest camera)', async () => {
    rtspDescribeMock.mockResolvedValue(passingProbe);
    ffprobeStreamMock.mockResolvedValue(passingProbe);

    const result = await testCameraConnection({
      mainRtspUrl: 'rtsp://198.51.100.7/user=admin_password=FAKE@pw99_channel=1_stream=0',
      rtspUsername: 'admin',
      rtspPassword: 'FAKE@pw99',
    });

    expect(result.success).toBe(true);
    // DESCRIBE still gets the raw URL + separate creds (it builds its own Digest header)…
    expect(rtspDescribeMock).toHaveBeenCalledWith(
      'rtsp://198.51.100.7/user=admin_password=FAKE@pw99_channel=1_stream=0',
      'admin',
      'FAKE@pw99'
    );
    // …but ffprobe MUST receive the creds in the userinfo (percent-encoded @).
    expect(ffprobeStreamMock).toHaveBeenCalledWith(
      'rtsp://admin:FAKE%40pw99@198.51.100.7/user=admin_password=FAKE@pw99_channel=1_stream=0'
    );
  });

  it('does NOT run ffprobe when DESCRIBE fails (no false-negative masking)', async () => {
    rtspDescribeMock.mockResolvedValue({
      success: false,
      responseTimeMs: 4000,
      errorCode: 'CAMERA_TIMEOUT',
      errorMessage: 'RTSP timeout',
    });

    const result = await testCameraConnection({
      mainRtspUrl: 'rtsp://10.0.0.5/stream',
      rtspUsername: 'admin',
      rtspPassword: 'pw',
    });

    expect(result.success).toBe(false);
    expect(ffprobeStreamMock).not.toHaveBeenCalled();
  });
});
