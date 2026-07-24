import { describe, it, expect } from 'vitest';
import type { Camera } from './cameras.types';
import { configFormFromCamera } from './cameraConfigForm';

function makeCamera(overrides: Partial<Camera> = {}): Camera {
  return {
    id: 'cam-1',
    siteId: 'site-1',
    routerId: 'router-1',
    cameraCode: 'CAM-GGN-021',
    name: 'Lobby Cam',
    brand: 'Hikvision',
    model: 'DS-2CD',
    firmware: 'v5.7',
    serialNumber: 'SN-123',
    onvifPort: 80,
    latitude: 28.600148,
    longitude: 77.19458,
    playbackAdapter: 'ONVIF_G',
    expectedCodec: 'H.264',
    expectedResolution: '1920x1080',
    expectedFps: 15,
    expectedBitrateKbps: 2048,
    provisioningState: 'CONFIGURED',
    healthScore: 92,
    status: 'HEALTHY',
    diagnosis: null,
    lastHealthyAt: '2026-08-27T10:00:00.000Z',
    lastSnapshotAt: null,
    maintenanceMode: false,
    snapshotIntervalMinutes: 30,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
    site: { id: 'site-1', name: 'HQ' },
    router: { id: 'router-1', connectionStatus: 'ONLINE', signalStrength: -55, operator: 'Jio' },
    ...overrides,
  };
}

describe('configFormFromCamera', () => {
  it('prefills non-secret fields and leaves RTSP blank', () => {
    const form = configFormFromCamera(makeCamera());
    expect(form.name).toBe('Lobby Cam');
    expect(form.siteId).toBe('site-1');
    expect(form.routerId).toBe('router-1');
    expect(form.latitude).toBe('28.600148');
    expect(form.longitude).toBe('77.19458');
    expect(form.expectedFps).toBe('15');
    expect(form.expectedBitrateKbps).toBe('2048');
    expect(form.snapshotIntervalMinutes).toBe('30');
    expect(form.onvifPort).toBe('80');
    expect(form.playbackAdapter).toBe('ONVIF_G');
    // secrets never come back from the API — always blank
    expect(form.mainRtspUrl).toBe('');
    expect(form.subRtspUrl).toBe('');
    expect(form.rtspUsername).toBe('');
    expect(form.rtspPassword).toBe('');
  });

  it('maps null placement/stream fields (DRAFT) to empty strings', () => {
    const form = configFormFromCamera(
      makeCamera({
        siteId: null,
        routerId: null,
        latitude: null,
        longitude: null,
        expectedCodec: null,
        expectedResolution: null,
        expectedFps: null,
        expectedBitrateKbps: null,
        onvifPort: null,
      })
    );
    expect(form.siteId).toBe('');
    expect(form.latitude).toBe('');
    expect(form.expectedCodec).toBe('');
    expect(form.expectedFps).toBe('');
    expect(form.onvifPort).toBe('');
  });
});

import { validateConfigForm } from './cameraConfigForm';
import type { CameraConfigFormState } from './cameraConfigForm';

function validForm(overrides: Partial<CameraConfigFormState> = {}): CameraConfigFormState {
  return {
    name: 'Lobby Cam',
    siteId: 'site-1',
    routerId: 'router-1',
    mainRtspUrl: 'rtsp://10.0.0.1/main',
    subRtspUrl: 'rtsp://10.0.0.1/sub',
    rtspUsername: 'admin',
    rtspPassword: 'secret',
    onvifPort: '80',
    playbackAdapter: 'ONVIF_G',
    expectedCodec: 'H.264',
    expectedResolution: '1920x1080',
    expectedFps: '15',
    expectedBitrateKbps: '2048',
    latitude: '28.6',
    longitude: '77.2',
    snapshotIntervalMinutes: '30',
    ...overrides,
  };
}

describe('validateConfigForm', () => {
  it('passes a fully valid form in both modes', () => {
    expect(validateConfigForm(validForm(), 'create')).toEqual({});
    expect(validateConfigForm(validForm(), 'edit')).toEqual({});
  });

  it('requires RTSP fields in create mode', () => {
    const errs = validateConfigForm(
      validForm({ mainRtspUrl: '', rtspUsername: '', rtspPassword: '' }),
      'create'
    );
    expect(errs.mainRtspUrl).toBeTruthy();
    expect(errs.rtspUsername).toBeTruthy();
    expect(errs.rtspPassword).toBeTruthy();
  });

  it('allows blank RTSP fields in edit mode (blank = keep)', () => {
    const errs = validateConfigForm(
      validForm({ mainRtspUrl: '', subRtspUrl: '', rtspUsername: '', rtspPassword: '' }),
      'edit'
    );
    expect(errs.mainRtspUrl).toBeUndefined();
    expect(errs.rtspUsername).toBeUndefined();
    expect(errs.rtspPassword).toBeUndefined();
  });

  it('still format-checks a non-blank RTSP URL in edit mode', () => {
    const errs = validateConfigForm(validForm({ mainRtspUrl: 'http://nope' }), 'edit');
    expect(errs.mainRtspUrl).toBeTruthy();
  });

  it('requires non-RTSP fields in both modes and bounds numbers', () => {
    const errs = validateConfigForm(
      validForm({
        name: '',
        siteId: '',
        expectedFps: '999',
        snapshotIntervalMinutes: '0',
        latitude: '200',
      }),
      'edit'
    );
    expect(errs.name).toBeTruthy();
    expect(errs.siteId).toBeTruthy();
    expect(errs.expectedFps).toBeTruthy();
    expect(errs.snapshotIntervalMinutes).toBeTruthy();
    expect(errs.latitude).toBeTruthy();
  });
});

import { buildConfigureBody, buildUpdateBody } from './cameraConfigForm';

describe('buildConfigureBody', () => {
  it('produces the full required configure payload', () => {
    const body = buildConfigureBody(validForm());
    expect(body).toEqual({
      siteId: 'site-1',
      routerId: 'router-1',
      mainRtspUrl: 'rtsp://10.0.0.1/main',
      subRtspUrl: 'rtsp://10.0.0.1/sub',
      rtspUsername: 'admin',
      rtspPassword: 'secret',
      onvifPort: 80,
      playbackAdapter: 'ONVIF_G',
      expectedCodec: 'H.264',
      expectedResolution: '1920x1080',
      expectedFps: 15,
      expectedBitrateKbps: 2048,
      latitude: 28.6,
      longitude: 77.2,
    });
  });
});

describe('buildUpdateBody', () => {
  it('omits every blank RTSP field and never sends status/maintenanceMode', () => {
    const body = buildUpdateBody(
      validForm({
        mainRtspUrl: '',
        subRtspUrl: '',
        rtspUsername: '',
        rtspPassword: '',
      })
    );
    expect('mainRtspUrl' in body).toBe(false);
    expect('subRtspUrl' in body).toBe(false);
    expect('rtspUsername' in body).toBe(false);
    expect('rtspPassword' in body).toBe(false);
    expect('status' in body).toBe(false);
    expect('maintenanceMode' in body).toBe(false);
    expect(body.name).toBe('Lobby Cam');
    expect(body.snapshotIntervalMinutes).toBe(30);
    expect(body.latitude).toBe(28.6);
    expect(body.expectedFps).toBe(15);
  });

  it('includes only the RTSP fields that were re-entered', () => {
    const body = buildUpdateBody(
      validForm({
        mainRtspUrl: '',
        subRtspUrl: '',
        rtspUsername: '',
        rtspPassword: 'newpass',
      })
    );
    expect('mainRtspUrl' in body).toBe(false);
    expect(body.rtspPassword).toBe('newpass');
  });

  it('omits onvifPort when blank', () => {
    const body = buildUpdateBody(validForm({ onvifPort: '' }));
    expect('onvifPort' in body).toBe(false);
  });
});
