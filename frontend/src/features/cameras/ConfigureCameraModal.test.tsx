import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Camera } from './cameras.types';

// ---- hoisted spies (referenced by the hoisted vi.mock factories) ----
const h = vi.hoisted(() => {
  const okConfigure = () => ({
    unwrap: () =>
      Promise.resolve({ id: 'cam-1', name: 'Dock 3 entry', provisioningState: 'DRAFT' }),
  });
  const okActivate = () => ({
    unwrap: () =>
      Promise.resolve({
        activated: true,
        camera: { id: 'cam-1', name: 'Dock 3 entry' },
        test: { success: true, simMode: true, describe: { success: true }, video: { success: true } },
      }),
  });
  return {
    configure: vi.fn(okConfigure),
    activate: vi.fn(okActivate),
    testConn: vi.fn(() => ({
      unwrap: () =>
        Promise.resolve({
          success: true,
          simMode: true,
          describe: { success: true },
          video: { success: true, codec: 'H.264', resolution: '1920x1080', fps: 15 },
        }),
    })),
    reset: vi.fn(),
    okConfigure,
    okActivate,
    isSaving: false,
    isActivating: false,
    isProbing: false,
    probeData: undefined as unknown,
  };
});

vi.mock('./cameras.api', () => ({
  useConfigureCameraMutation: () => [h.configure, { isLoading: h.isSaving }],
  useActivateCameraMutation: () => [h.activate, { isLoading: h.isActivating }],
  useTestCameraConnectionMutation: () => [
    h.testConn,
    { data: h.probeData, isLoading: h.isProbing, reset: h.reset },
  ],
  useListSitesLiteQuery: () => ({
    data: { items: [{ id: 'site-1', name: 'HQ' }], total: 1, page: 1, limit: 100 },
  }),
  useListRoutersLiteQuery: () => ({
    data: {
      items: [{ id: 'r-1', siteId: 'site-1', serialNumber: 'RTR-9', model: 'RUT240' }],
      total: 1,
      page: 1,
      limit: 100,
    },
  }),
}));

// Minimal MapLibre stub — the modal only needs it not to throw.
vi.mock('maplibre-gl', () => {
  class Map {
    on = vi.fn();
    addControl = vi.fn();
    setCenter = vi.fn();
    setZoom = vi.fn();
    remove = vi.fn();
  }
  class NavigationControl {}
  class Marker {
    on = vi.fn();
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    getLngLat() {
      return { lng: 77.2, lat: 28.6 };
    }
    remove() {}
  }
  return { default: { Map, NavigationControl, Marker } };
});

import { ConfigureCameraModal } from './ConfigureCameraModal';

const draftCamera = {
  id: 'cam-1',
  cameraCode: 'CAM-GGN-021',
  name: 'Dock 3 entry',
  provisioningState: 'DRAFT',
  siteId: null,
  routerId: null,
  onvifPort: null,
  latitude: null,
  longitude: null,
  playbackAdapter: 'NONE',
  expectedCodec: null,
  expectedResolution: null,
  expectedFps: null,
  expectedBitrateKbps: null,
} as unknown as Camera;

function setup(overrides: Partial<React.ComponentProps<typeof ConfigureCameraModal>> = {}) {
  const onClose = vi.fn();
  const notify = { success: vi.fn(), error: vi.fn() };
  render(
    <ConfigureCameraModal open camera={draftCamera} onClose={onClose} notify={notify} {...overrides} />
  );
  return { onClose, notify };
}

function fill(label: RegExp, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** Fill every required field so the save/activate buttons enable. */
function fillRequired(): void {
  fireEvent.change(screen.getByLabelText('Site'), { target: { value: 'site-1' } });
  fireEvent.change(screen.getByLabelText('Router'), { target: { value: 'r-1' } });
  fill(/main rtsp url/i, 'rtsp://10.20.40.11:554/stream1');
  fill(/sub rtsp url/i, 'rtsp://10.20.40.11:554/stream2');
  fill(/rtsp user/i, 'admin');
  fill(/rtsp password/i, 's3cret');
  // codec/resolution/fps/bitrate prefill with defaults; only coords are missing.
  fill(/latitude/i, '28.600148');
  fill(/longitude/i, '77.19458');
}

beforeEach(() => {
  vi.clearAllMocks();
  h.isSaving = false;
  h.isActivating = false;
  h.isProbing = false;
  h.probeData = undefined;
  h.configure.mockImplementation(h.okConfigure);
  h.activate.mockImplementation(h.okActivate);
});

describe('ConfigureCameraModal — step 2 placement + stream config', () => {
  it('renders the configuration sections for a draft camera', () => {
    setup();
    expect(screen.getByText(/Configure Dock 3 entry/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Site')).toBeInTheDocument();
    expect(screen.getByLabelText('Router')).toBeInTheDocument();
    expect(screen.getByLabelText(/main rtsp url/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Playback adapter')).toBeInTheDocument();
    expect(screen.getByLabelText(/codec/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/latitude/i)).toBeInTheDocument();
    // Draft cameras get both the draft-save and activate actions.
    expect(screen.getByRole('button', { name: /save as draft/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save & activate/i })).toBeInTheDocument();
  });

  it('keeps save/activate disabled until every required field (incl. pin) is set', () => {
    setup();
    const activate = screen.getByRole('button', { name: /save & activate/i });
    const saveDraft = screen.getByRole('button', { name: /save as draft/i });
    expect(activate).toBeDisabled();
    expect(saveDraft).toBeDisabled();
    fillRequired();
    expect(activate).toBeEnabled();
    expect(saveDraft).toBeEnabled();
  });

  it('probes the entered RTSP with the camera code on Test connection', async () => {
    setup();
    fill(/main rtsp url/i, 'rtsp://10.20.40.11:554/stream1');
    fill(/rtsp user/i, 'admin');
    fill(/rtsp password/i, 's3cret');
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }));
    await waitFor(() => expect(h.testConn).toHaveBeenCalledTimes(1));
    expect(h.testConn).toHaveBeenCalledWith(
      expect.objectContaining({
        mainRtspUrl: 'rtsp://10.20.40.11:554/stream1',
        rtspUsername: 'admin',
        rtspPassword: 's3cret',
        cameraCode: 'CAM-GGN-021',
      })
    );
  });

  it('configures then activates, and closes with a success toast when activated', async () => {
    const { onClose, notify } = setup();
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: /save & activate/i }));

    await waitFor(() => expect(h.configure).toHaveBeenCalledTimes(1));
    expect(h.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cam-1',
        body: expect.objectContaining({
          siteId: 'site-1',
          routerId: 'r-1',
          mainRtspUrl: 'rtsp://10.20.40.11:554/stream1',
          latitude: 28.600148,
          longitude: 77.19458,
          expectedFps: 15,
          expectedBitrateKbps: 2048,
        }),
      })
    );
    await waitFor(() => expect(h.activate).toHaveBeenCalledWith('cam-1'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(notify.success).toHaveBeenCalledWith('Camera activated', expect.stringMatching(/live/i));
  });

  it('surfaces the probe reason and stays open when activation is refused', async () => {
    const { onClose, notify } = setup();
    h.activate.mockReturnValueOnce({
      unwrap: () =>
        Promise.resolve({
          activated: false,
          camera: { id: 'cam-1', name: 'Dock 3 entry' },
          test: {
            success: false,
            simMode: false,
            describe: { success: true },
            video: { success: false, errorMessage: 'No RTSP response from camera' },
          },
        }),
    });
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: /save & activate/i }));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'Activation failed',
        'No RTSP response from camera'
      )
    );
    expect(h.configure).toHaveBeenCalledTimes(1); // config was still saved
    expect(onClose).not.toHaveBeenCalled();
    expect(notify.success).not.toHaveBeenCalled();
  });

  it('"Save as draft" configures only — never activates', async () => {
    const { onClose, notify } = setup();
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }));

    await waitFor(() => expect(h.configure).toHaveBeenCalledTimes(1));
    expect(h.activate).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(notify.success).toHaveBeenCalledWith(
      'Configuration saved',
      expect.stringMatching(/activate/i)
    );
  });

  it('a CONFIGURED camera shows a single "Save changes" action (no activate)', () => {
    setup({
      camera: {
        ...draftCamera,
        provisioningState: 'CONFIGURED',
        siteId: 'site-1',
        routerId: 'r-1',
        latitude: 28.6,
        longitude: 77.2,
        expectedCodec: 'H.264',
        expectedResolution: '1920x1080',
        expectedFps: 15,
        expectedBitrateKbps: 2048,
      } as unknown as Camera,
    });
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save & activate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save as draft/i })).not.toBeInTheDocument();
  });
});
