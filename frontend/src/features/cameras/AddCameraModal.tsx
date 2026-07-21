import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { CheckCircle2, PlugZap, XCircle } from 'lucide-react';
import { AnimatedModal, Button, Input } from '@/components/ui';
import { getApiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/utils';
import {
  useCreateCameraMutation,
  useListRoutersLiteQuery,
  useListSitesLiteQuery,
  useTestCameraConnectionMutation,
} from './cameras.api';
import { DELHI_NCR, OSM_RASTER_STYLE } from './mapStyle';

const SELECT_CLASSES =
  'h-9 w-full rounded-lg border border-hairline bg-card px-3 text-sm text-ink transition-colors hover:border-sage focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage';

interface AddCameraModalProps {
  open: boolean;
  onClose: () => void;
  notify: {
    success: (title: string, description?: string) => void;
    error: (title: string, description?: string) => void;
  };
}

interface FormState {
  siteId: string;
  routerId: string;
  cameraCode: string;
  name: string;
  brand: string;
  model: string;
  mainRtspUrl: string;
  subRtspUrl: string;
  rtspUsername: string;
  rtspPassword: string;
  onvifPort: string;
  expectedCodec: string;
  expectedResolution: string;
  expectedFps: string;
  expectedBitrateKbps: string;
}

const INITIAL_FORM: FormState = {
  siteId: '',
  routerId: '',
  cameraCode: '',
  name: '',
  brand: '',
  model: '',
  mainRtspUrl: '',
  subRtspUrl: '',
  rtspUsername: '',
  rtspPassword: '',
  onvifPort: '',
  expectedCodec: 'H.264',
  expectedResolution: '1920x1080',
  expectedFps: '15',
  expectedBitrateKbps: '2048',
};

// CR-6 — admin/engineer camera registration. Mirrors backend
// createCameraSchema: RTSP secrets travel plaintext over TLS and are encrypted
// at rest server-side; the map pin supplies the mandatory WGS-84 position.
export function AddCameraModal({ open, onClose, notify }: AddCameraModalProps): JSX.Element {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);

  const { data: sites } = useListSitesLiteQuery(undefined, { skip: !open });
  const { data: routers } = useListRoutersLiteQuery(undefined, { skip: !open });
  const [createCamera, { isLoading: isCreating }] = useCreateCameraMutation();
  const [testConnection, { data: probe, isLoading: isProbing, reset: resetProbe }] =
    useTestCameraConnectionMutation();

  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  // Pin-picker mini map — rebuilt each time the modal opens (the container is
  // unmounted by AnimatePresence while closed).
  useEffect(() => {
    if (!open || !mapContainerRef.current) return undefined;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: OSM_RASTER_STYLE,
      center: DELHI_NCR,
      zoom: 9,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const marker = new maplibregl.Marker({ draggable: true, color: '#3f67d8' });
    const place = (lngLat: { lng: number; lat: number }): void => {
      setPin({ lat: +lngLat.lat.toFixed(6), lng: +lngLat.lng.toFixed(6) });
    };
    map.on('click', (event) => {
      marker.setLngLat(event.lngLat).addTo(map);
      place(event.lngLat);
    });
    marker.on('dragend', () => place(marker.getLngLat()));
    return () => {
      map.remove();
    };
  }, [open]);

  const routerOptions = useMemo(() => {
    const items = routers?.items ?? [];
    return form.siteId ? items.filter((router) => router.siteId === form.siteId) : items;
  }, [routers, form.siteId]);

  const set =
    (key: keyof FormState) =>
    (event: React.ChangeEvent<HTMLInputElement>): void =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  const canProbe =
    form.mainRtspUrl.trim() !== '' && form.rtspUsername.trim() !== '' && form.rtspPassword !== '';

  const requiredReady =
    form.siteId !== '' &&
    form.routerId !== '' &&
    form.cameraCode.trim() !== '' &&
    form.name.trim() !== '' &&
    canProbe &&
    form.subRtspUrl.trim() !== '' &&
    form.expectedCodec.trim() !== '' &&
    form.expectedResolution.trim() !== '' &&
    Number(form.expectedFps) >= 1 &&
    Number(form.expectedBitrateKbps) >= 1 &&
    pin !== null;

  const handleProbe = async (): Promise<void> => {
    try {
      await testConnection({
        mainRtspUrl: form.mainRtspUrl.trim(),
        rtspUsername: form.rtspUsername.trim(),
        rtspPassword: form.rtspPassword,
        cameraCode: form.cameraCode.trim() || undefined,
        expectedCodec: form.expectedCodec.trim() || undefined,
        expectedResolution: form.expectedResolution.trim() || undefined,
        expectedFps: form.expectedFps ? Number(form.expectedFps) : undefined,
        expectedBitrateKbps: form.expectedBitrateKbps
          ? Number(form.expectedBitrateKbps)
          : undefined,
      }).unwrap();
    } catch (err) {
      notify.error('Probe failed', getApiErrorMessage(err as FetchBaseQueryError));
    }
  };

  const handleSubmit = async (): Promise<void> => {
    if (!requiredReady || pin === null) return;
    try {
      const created = await createCamera({
        siteId: form.siteId,
        routerId: form.routerId,
        cameraCode: form.cameraCode.trim(),
        name: form.name.trim(),
        brand: form.brand.trim() || undefined,
        model: form.model.trim() || undefined,
        mainRtspUrl: form.mainRtspUrl.trim(),
        subRtspUrl: form.subRtspUrl.trim(),
        rtspUsername: form.rtspUsername.trim(),
        rtspPassword: form.rtspPassword,
        onvifPort: form.onvifPort ? Number(form.onvifPort) : undefined,
        expectedCodec: form.expectedCodec.trim(),
        expectedResolution: form.expectedResolution.trim(),
        expectedFps: Number(form.expectedFps),
        expectedBitrateKbps: Number(form.expectedBitrateKbps),
        latitude: pin.lat,
        longitude: pin.lng,
      }).unwrap();
      notify.success(
        'Camera registered',
        `${created.name} (${created.cameraCode}) joined the fleet.`
      );
      setForm(INITIAL_FORM);
      setPin(null);
      resetProbe();
      onClose();
    } catch (err) {
      notify.error('Registration failed', getApiErrorMessage(err as FetchBaseQueryError));
    }
  };

  return (
    <AnimatedModal
      open={open}
      onClose={onClose}
      title="Register camera"
      description="Wire a new ONVIF/RTSP camera to its site, router and map position."
      size="full"
    >
      <div className="-mr-2 max-h-[70vh] space-y-4 overflow-y-auto pr-2">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-secondary">Site *</span>
                <select
                  value={form.siteId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      siteId: event.target.value,
                      routerId: '',
                    }))
                  }
                  className={SELECT_CLASSES}
                  aria-label="Site"
                >
                  <option value="">Select site…</option>
                  {(sites?.items ?? []).map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-secondary">Router *</span>
                <select
                  value={form.routerId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, routerId: event.target.value }))
                  }
                  className={SELECT_CLASSES}
                  aria-label="Router"
                >
                  <option value="">Select router…</option>
                  {routerOptions.map((router) => (
                    <option key={router.id} value={router.id}>
                      {router.serialNumber} · {router.model}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Camera code *"
                placeholder="CAM-GGN-021"
                value={form.cameraCode}
                onChange={set('cameraCode')}
              />
              <Input
                label="Name *"
                placeholder="Dock 3 entry"
                value={form.name}
                onChange={set('name')}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Brand"
                placeholder="Hikvision"
                value={form.brand}
                onChange={set('brand')}
              />
              <Input
                label="Model"
                placeholder="DS-2CD2043"
                value={form.model}
                onChange={set('model')}
              />
            </div>
            <Input
              label="Main RTSP URL *"
              placeholder="rtsp://10.20.40.11:554/stream1"
              value={form.mainRtspUrl}
              onChange={set('mainRtspUrl')}
            />
            <Input
              label="Sub RTSP URL *"
              placeholder="rtsp://10.20.40.11:554/stream2"
              value={form.subRtspUrl}
              onChange={set('subRtspUrl')}
            />
            <div className="grid grid-cols-3 gap-3">
              <Input
                label="RTSP user *"
                autoComplete="off"
                value={form.rtspUsername}
                onChange={set('rtspUsername')}
              />
              <Input
                label="RTSP password *"
                type="password"
                autoComplete="new-password"
                value={form.rtspPassword}
                onChange={set('rtspPassword')}
              />
              <Input
                label="ONVIF port"
                type="number"
                placeholder="80"
                value={form.onvifPort}
                onChange={set('onvifPort')}
              />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <Input label="Codec *" value={form.expectedCodec} onChange={set('expectedCodec')} />
              <Input
                label="Resolution *"
                value={form.expectedResolution}
                onChange={set('expectedResolution')}
              />
              <Input
                label="FPS *"
                type="number"
                value={form.expectedFps}
                onChange={set('expectedFps')}
              />
              <Input
                label="Bitrate kbps *"
                type="number"
                value={form.expectedBitrateKbps}
                onChange={set('expectedBitrateKbps')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-medium text-secondary">
              Map position * — click to drop the pin, drag to fine-tune
            </span>
            <div
              ref={mapContainerRef}
              className="h-72 w-full overflow-hidden rounded-lg border border-hairline"
              role="application"
              aria-label="Camera position picker"
            />
            <p className="text-xs tabular-nums text-muted">
              {pin ? `Pinned at ${pin.lat}, ${pin.lng}` : 'No position pinned yet.'}
            </p>

            {probe && (
              <div
                className={cn(
                  'rounded-lg border p-3 text-xs',
                  probe.success
                    ? 'border-state-healthy/30 bg-state-healthy-soft text-state-healthy'
                    : 'border-state-critical/30 bg-state-critical-soft text-state-critical'
                )}
                data-testid="probe-result"
              >
                <p className="flex items-center gap-1.5 font-semibold">
                  {probe.success ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  {probe.success ? 'Stream reachable' : 'Probe failed'}
                  {probe.simMode && <span className="font-normal text-muted">(sim mode)</span>}
                </p>
                <p className="mt-1">
                  DESCRIBE: {probe.describe.success ? 'ok' : (probe.describe.errorCode ?? 'failed')}{' '}
                  · Video:{' '}
                  {probe.video.success
                    ? `${probe.video.codec ?? '?'} ${probe.video.resolution ?? ''} @${probe.video.fps ?? '?'}fps`
                    : (probe.video.errorMessage ?? probe.video.errorCode ?? 'failed')}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-hairline pt-4">
          <Button
            variant="secondary"
            size="sm"
            disabled={!canProbe || isProbing}
            loading={isProbing}
            onClick={() => void handleProbe()}
            leftIcon={<PlugZap size={14} />}
          >
            Test connection
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!requiredReady || isCreating}
            loading={isCreating}
            onClick={() => void handleSubmit()}
          >
            Register camera
          </Button>
        </div>
      </div>
    </AnimatedModal>
  );
}
