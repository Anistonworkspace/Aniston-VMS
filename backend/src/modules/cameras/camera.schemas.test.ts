import { describe, it, expect } from 'vitest';
import {
  registerCameraSchema,
  configureCameraSchema,
  updateCameraSchema,
} from './camera.schemas.js';

// ─────────────────────────────────────────────────────────────────────────────
// The register/configure split is the whole point of the redesign, so the
// schemas are the contract that enforces it:
//   • registerCameraSchema  — identity ONLY (what you need to add a physical
//     camera to inventory as DRAFT). It must NOT require site/router/RTSP.
//   • configureCameraSchema — the full placement + stream config, ALL required,
//     so that a saved config is always complete enough to activate.
// Every RTSP/credential value below is fabricated.
// ─────────────────────────────────────────────────────────────────────────────

const validConfig = {
  siteId: '11111111-1111-1111-1111-111111111111',
  routerId: '22222222-2222-2222-2222-222222222222',
  mainRtspUrl: 'rtsp://cam.example/main',
  subRtspUrl: 'rtsp://cam.example/sub',
  rtspUsername: 'operator',
  rtspPassword: 'fabricated-pass',
  expectedCodec: 'H264',
  expectedResolution: '1920x1080',
  expectedFps: 25,
  expectedBitrateKbps: 4096,
  latitude: 28.61,
  longitude: 77.21,
};

describe('registerCameraSchema — identity only', () => {
  it('accepts a bare identity payload (no site/router/RTSP needed)', () => {
    const parsed = registerCameraSchema.parse({ cameraCode: 'CAM-001', name: 'Front Gate' });
    expect(parsed).toEqual({ cameraCode: 'CAM-001', name: 'Front Gate' });
  });

  it('accepts optional identity metadata', () => {
    const parsed = registerCameraSchema.parse({
      cameraCode: 'CAM-002',
      name: 'Lobby',
      brand: 'Acme',
      model: 'X1',
      firmware: '1.2.3',
      serialNumber: 'SN-9',
    });
    expect(parsed.brand).toBe('Acme');
  });

  it('requires cameraCode and name', () => {
    expect(registerCameraSchema.safeParse({ name: 'x' }).success).toBe(false);
    expect(registerCameraSchema.safeParse({ cameraCode: 'x' }).success).toBe(false);
  });

  it('drops stream-config fields — they are not part of registration', () => {
    const parsed = registerCameraSchema.parse({
      cameraCode: 'CAM-003',
      name: 'Dock',
      siteId: validConfig.siteId,
      mainRtspUrl: validConfig.mainRtspUrl,
    } as Record<string, unknown>);
    expect(parsed).not.toHaveProperty('siteId');
    expect(parsed).not.toHaveProperty('mainRtspUrl');
  });
});

describe('configureCameraSchema — full placement + stream config, all required', () => {
  it('accepts a complete config and normalizes RTSP urls', () => {
    const parsed = configureCameraSchema.parse({
      ...validConfig,
      mainRtspUrl: 'RTSP://cam.example/main',
    });
    expect(parsed.mainRtspUrl).toBe('rtsp://cam.example/main');
    expect(parsed.siteId).toBe(validConfig.siteId);
  });

  it.each([
    'siteId',
    'routerId',
    'mainRtspUrl',
    'subRtspUrl',
    'rtspUsername',
    'rtspPassword',
    'expectedCodec',
    'expectedResolution',
    'expectedFps',
    'expectedBitrateKbps',
    'latitude',
    'longitude',
  ])('requires %s', (field) => {
    const body: Record<string, unknown> = { ...validConfig };
    delete body[field];
    expect(configureCameraSchema.safeParse(body).success).toBe(false);
  });

  it('rejects out-of-range coordinates', () => {
    expect(configureCameraSchema.safeParse({ ...validConfig, latitude: 91 }).success).toBe(false);
    expect(configureCameraSchema.safeParse({ ...validConfig, longitude: -181 }).success).toBe(false);
  });

  it('rejects a malformed RTSP url without echoing it back', () => {
    const res = configureCameraSchema.safeParse({ ...validConfig, mainRtspUrl: 'http://nope' });
    expect(res.success).toBe(false);
    if (!res.success) {
      const msg = res.error.issues.map((i) => i.message).join(' ');
      expect(msg).toMatch(/RTSP/);
      expect(msg).not.toContain('nope');
    }
  });
});

describe('updateCameraSchema — every field optional (identity or config), plus maintenance', () => {
  it('accepts an empty object', () => {
    expect(updateCameraSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a partial config edit', () => {
    const parsed = updateCameraSchema.parse({ name: 'Renamed', expectedFps: 30 });
    expect(parsed).toEqual({ name: 'Renamed', expectedFps: 30 });
  });

  it('accepts maintenanceMode and snapshotIntervalMinutes', () => {
    const parsed = updateCameraSchema.parse({ maintenanceMode: true, snapshotIntervalMinutes: 15 });
    expect(parsed.maintenanceMode).toBe(true);
    expect(parsed.snapshotIntervalMinutes).toBe(15);
  });

  it('enforces snapshotIntervalMinutes bounds (1–60)', () => {
    expect(updateCameraSchema.safeParse({ snapshotIntervalMinutes: 0 }).success).toBe(false);
    expect(updateCameraSchema.safeParse({ snapshotIntervalMinutes: 61 }).success).toBe(false);
  });
});
