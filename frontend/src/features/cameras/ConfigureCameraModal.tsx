import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { AlertTriangle, CheckCircle2, PlugZap, XCircle } from 'lucide-react';
import { AnimatedModal, Button, Input } from '@/components/ui';
import { getApiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/utils';
import {
  useActivateCameraMutation,
  useConfigureCameraMutation,
  useListRoutersLiteQuery,
  useListSitesLiteQuery,
  useTestCameraConnectionMutation,
} from './cameras.api';
import type {
  Camera,
  ConfigureCameraInput,
  PlaybackAdapter,
  TestConnectionResult,
} from './cameras.types';
import { DELHI_NCR, OSM_RASTER_STYLE } from './mapStyle';
import {
  areCoordinatesValid,
  formatCoordinate,
  parseCoordinate,
  validateLatitude,
  validateLongitude,
} from './coordinates';

const SELECT_CLASSES =
  'h-9 w-full rounded-lg border border-hairline bg-card px-3 text-sm text-ink transition-colors hover:border-sage focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage';

const PLAYBACK_ADAPTERS: { value: PlaybackAdapter; label: string }[] = [
  { value: 'NONE', label: 'None (live only)' },
  { value: 'ONVIF_G', label: 'ONVIF (Profile G)' },
  { value: 'HIKVISION', label: 'Hikvision' },
  { value: 'DAHUA', label: 'Dahua' },
];

interface ConfigureCameraModalProps {
  open: boolean;
  camera: Camera;
  onClose: () => void;
  notify: {
    success: (title: string, description?: string) => void;
    error: (title: string, description?: string) => void;
  };
}

// Step 2 of the split workflow — mirrors backend configureCameraSchema. Saves
// placement (site/router/map) + network + stream config onto an already-
// registered camera. RTSP secrets are never returned by the API, so they are
// always entered fresh here; everything else prefills from the camera.
interface FormState {
  siteId: string;
  routerId: string;
  mainRtspUrl: string;
  subRtspUrl: string;
  rtspUsername: string;
  rtspPassword: string;
  onvifPort: string;
  playbackAdapter: PlaybackAdapter;
}

/**
 * Reason text for a failed activation (a 200 with `activated: false`). Activation
 * gates on DESCRIBE — reachability + authentication — so the DESCRIBE stage carries
 * the blocking reason; the live-video stage is advisory and never blocks activation.
 */
function activationFailureReason(test: TestConnectionResult): string {
  return (
    test.describe.errorMessage ??
    test.describe.errorCode ??
    test.video.errorMessage ??
    test.video.errorCode ??
    'Connection test failed against the saved configuration.'
  );
}

/**
 * Configure a registered (DRAFT) camera — or edit a placed one. Collects the
 * site/router/map placement and RTSP network details,
 * then either saves the config state-preserving or (for a DRAFT) saves and
 * activates: activation RE-RUNS the probe server-side against the stored config
 * and only flips DRAFT → CONFIGURED on success.
 */
export function ConfigureCameraModal({
  open,
  camera,
  onClose,
  notify,
}: ConfigureCameraModalProps): JSX.Element {
  const isDraft = camera.provisioningState === 'DRAFT';

  const [form, setForm] = useState<FormState>({
    siteId: '',
    routerId: '',
    mainRtspUrl: '',
    subRtspUrl: '',
    rtspUsername: '',
    rtspPassword: '',
    onvifPort: '',
    playbackAdapter: 'NONE',
  });
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [latText, setLatText] = useState('');
  const [lngText, setLngText] = useState('');
  const [latTouched, setLatTouched] = useState(false);
  const [lngTouched, setLngTouched] = useState(false);

  const { data: sites } = useListSitesLiteQuery(undefined, { skip: !open });
  const { data: routers } = useListRoutersLiteQuery(undefined, { skip: !open });
  const [configureCamera, { isLoading: isSaving }] = useConfigureCameraMutation();
  const [activateCamera, { isLoading: isActivating }] = useActivateCameraMutation();
  const [testConnection, { data: probe, isLoading: isProbing, reset: resetProbe }] =
    useTestCameraConnectionMutation();

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  // Prefill config fields from the camera each time the modal opens. RTSP
  // secrets are encrypted at rest and never returned, so they stay blank.
  useEffect(() => {
    if (!open) return;
    setForm({
      siteId: camera.siteId ?? '',
      routerId: camera.routerId ?? '',
      mainRtspUrl: '',
      subRtspUrl: '',
      rtspUsername: '',
      rtspPassword: '',
      onvifPort: camera.onvifPort != null ? String(camera.onvifPort) : '',
      playbackAdapter: camera.playbackAdapter,
    });
    if (camera.latitude != null && camera.longitude != null) {
      setPin({ lat: camera.latitude, lng: camera.longitude });
      setLatText(formatCoordinate(camera.latitude));
      setLngText(formatCoordinate(camera.longitude));
    } else {
      setPin(null);
      setLatText('');
      setLngText('');
    }
    setLatTouched(false);
    setLngTouched(false);
    resetProbe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, camera.id]);

  // Pin-picker mini map — rebuilt each time the modal opens (the container is
  // unmounted by AnimatePresence while closed). Restores an existing pin so a
  // placed camera opens centred on its position.
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
    mapRef.current = map;
    markerRef.current = marker;

    // Map interaction is authoritative: drop/drag the pin, then mirror the
    // rounded WGS-84 pair back into the manual Latitude/Longitude fields.
    const place = (lngLat: { lng: number; lat: number }): void => {
      const lat = +lngLat.lat.toFixed(6);
      const lng = +lngLat.lng.toFixed(6);
      setPin({ lat, lng });
      setLatText(formatCoordinate(lat));
      setLngText(formatCoordinate(lng));
    };
    map.on('click', (event) => {
      marker.setLngLat(event.lngLat).addTo(map);
      place(event.lngLat);
    });
    marker.on('dragend', () => place(marker.getLngLat()));

    if (camera.latitude != null && camera.longitude != null) {
      const lngLat = { lng: camera.longitude, lat: camera.latitude };
      marker.setLngLat(lngLat).addTo(map);
      map.setCenter(lngLat);
      map.setZoom(14);
    }

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, camera.id]);

  const routerOptions = useMemo(() => {
    const items = routers?.items ?? [];
    return form.siteId ? items.filter((router) => router.siteId === form.siteId) : items;
  }, [routers, form.siteId]);

  const set =
    (key: keyof FormState) =>
    (event: ChangeEvent<HTMLInputElement>): void =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  // Manual coordinate entry — only nudges the pin (and map marker) once BOTH
  // fields hold a valid in-range decimal, so a half-typed value never jumps it.
  const syncPinFromText = (latValue: string, lngValue: string): void => {
    if (!areCoordinatesValid(latValue, lngValue)) return;
    const lat = parseCoordinate(latValue);
    const lng = parseCoordinate(lngValue);
    if (lat === null || lng === null) return;
    setPin({ lat, lng });
    if (mapRef.current && markerRef.current) {
      markerRef.current.setLngLat({ lng, lat }).addTo(mapRef.current);
      mapRef.current.setCenter({ lng, lat });
    }
  };

  const handleLatChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const value = event.target.value;
    setLatText(value);
    syncPinFromText(value, lngText);
  };
  const handleLngChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const value = event.target.value;
    setLngText(value);
    syncPinFromText(latText, value);
  };

  const latError = latTouched ? (validateLatitude(latText) ?? undefined) : undefined;
  const lngError = lngTouched ? (validateLongitude(lngText) ?? undefined) : undefined;

  const canProbe =
    form.mainRtspUrl.trim() !== '' && form.rtspUsername.trim() !== '' && form.rtspPassword !== '';

  const requiredReady =
    form.siteId !== '' &&
    form.routerId !== '' &&
    canProbe &&
    form.subRtspUrl.trim() !== '' &&
    pin !== null;

  const busy = isSaving || isActivating;

  const buildBody = (): ConfigureCameraInput => ({
    siteId: form.siteId,
    routerId: form.routerId,
    mainRtspUrl: form.mainRtspUrl.trim(),
    subRtspUrl: form.subRtspUrl.trim(),
    rtspUsername: form.rtspUsername.trim(),
    rtspPassword: form.rtspPassword,
    onvifPort: form.onvifPort ? Number(form.onvifPort) : undefined,
    playbackAdapter: form.playbackAdapter,
    latitude: pin!.lat,
    longitude: pin!.lng,
  });

  const handleProbe = async (): Promise<void> => {
    if (!canProbe) return;
    try {
      await testConnection({
        mainRtspUrl: form.mainRtspUrl.trim(),
        rtspUsername: form.rtspUsername.trim(),
        rtspPassword: form.rtspPassword,
        cameraCode: camera.cameraCode,
      }).unwrap();
    } catch (err) {
      notify.error('Probe failed', getApiErrorMessage(err as FetchBaseQueryError));
    }
  };

  // Save config without changing state (available for both DRAFT and CONFIGURED).
  const handleSaveOnly = async (): Promise<void> => {
    if (!requiredReady || pin === null) return;
    try {
      const updated = await configureCamera({ id: camera.id, body: buildBody() }).unwrap();
      notify.success(
        isDraft ? 'Configuration saved' : 'Configuration updated',
        isDraft
          ? `${updated.name} is configured — activate it when the camera is wired.`
          : `${updated.name}'s configuration was updated.`
      );
      onClose();
    } catch (err) {
      notify.error('Save failed', getApiErrorMessage(err as FetchBaseQueryError));
    }
  };

  // Save config then activate: DRAFT → CONFIGURED. Activation re-runs the probe
  // server-side; a failing probe is an expected 200 with { activated: false },
  // so the config is saved (camera stays DRAFT) and we surface the reason.
  const handleSaveAndActivate = async (): Promise<void> => {
    if (!requiredReady || pin === null) return;
    try {
      await configureCamera({ id: camera.id, body: buildBody() }).unwrap();
      const result = await activateCamera(camera.id).unwrap();
      if (result.activated) {
        // Activation gates on reachability + auth; the live-video stage is advisory.
        // Tell the operator the truth: "live and streaming" only when video was
        // validated, otherwise flag that health monitoring will verify the stream.
        if (result.test.video.success) {
          notify.success('Camera activated', `${result.camera.name} is live and streaming.`);
        } else {
          notify.success(
            'Camera activated',
            `${result.camera.name} is reachable and authenticated. Live video wasn't validated yet — health monitoring will track the stream.`
          );
        }
        onClose();
      } else {
        notify.error('Activation failed', activationFailureReason(result.test));
      }
    } catch (err) {
      notify.error('Activation failed', getApiErrorMessage(err as FetchBaseQueryError));
    }
  };

  return (
    <AnimatedModal
      open={open}
      onClose={onClose}
      title={`Configure ${camera.name}`}
      description="Place the camera on its site/router/map and wire its RTSP stream, then test and activate."
      size="full"
    >
      <div className="-mr-2 max-h-[70vh] space-y-5 overflow-y-auto pr-2">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-ink">Placement</h3>
              <div className="space-y-2">
                <span className="block text-xs font-medium text-secondary">
                  Map position * — click to drop the pin, drag to fine-tune
                </span>
                <div
                  ref={mapContainerRef}
                  className="h-64 w-full overflow-hidden rounded-lg border border-hairline"
                  role="application"
                  aria-label="Camera position picker"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Latitude *"
                    inputMode="decimal"
                    placeholder="28.600148"
                    value={latText}
                    onChange={handleLatChange}
                    onBlur={() => setLatTouched(true)}
                    error={latError}
                  />
                  <Input
                    label="Longitude *"
                    inputMode="decimal"
                    placeholder="77.19458"
                    value={lngText}
                    onChange={handleLngChange}
                    onBlur={() => setLngTouched(true)}
                    error={lngError}
                  />
                </div>
                <p className="text-xs tabular-nums text-muted">
                  {pin ? `Pinned at ${pin.lat}, ${pin.lng}` : 'No position pinned yet.'}
                </p>
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-ink">Site &amp; router</h3>
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
            </section>
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-ink">Stream &amp; network</h3>
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
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-secondary">
                  Playback adapter
                </span>
                <select
                  value={form.playbackAdapter}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      playbackAdapter: event.target.value as PlaybackAdapter,
                    }))
                  }
                  className={SELECT_CLASSES}
                  aria-label="Playback adapter"
                >
                  {PLAYBACK_ADAPTERS.map((adapter) => (
                    <option key={adapter.value} value={adapter.value}>
                      {adapter.label}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          </div>
        </div>

        {probe &&
          (() => {
            // Three honest outcomes, because activation now gates on reachability +
            // auth (DESCRIBE) while the live-video stage is advisory:
            //   • reachable + video validated  → healthy (green)  — good to go
            //   • reachable, video unvalidated → warning (amber)  — still activatable;
            //     health monitoring will track the stream
            //   • not reachable / auth failed  → critical (red)   — blocks activation
            const reachable = probe.success;
            const videoOk = probe.video.success;
            const tone = !reachable ? 'critical' : videoOk ? 'healthy' : 'warning';
            const toneClass = {
              healthy: 'border-state-healthy/30 bg-state-healthy-soft text-state-healthy',
              warning: 'border-state-warning/30 bg-state-warning-soft text-state-warning',
              critical: 'border-state-critical/30 bg-state-critical-soft text-state-critical',
            }[tone];
            const Icon =
              tone === 'healthy' ? CheckCircle2 : tone === 'warning' ? AlertTriangle : XCircle;
            const heading =
              tone === 'healthy'
                ? 'Stream reachable'
                : tone === 'warning'
                  ? 'Reachable — live video not validated'
                  : 'Probe failed';
            return (
              <div
                className={cn('rounded-lg border p-3 text-xs', toneClass)}
                data-testid="probe-result"
              >
                <p className="flex items-center gap-1.5 font-semibold">
                  <Icon size={14} />
                  {heading}
                  {probe.simMode && <span className="font-normal text-muted">(sim mode)</span>}
                </p>
                <p className="mt-1">
                  DESCRIBE: {probe.describe.success ? 'ok' : (probe.describe.errorCode ?? 'failed')}{' '}
                  · Video:{' '}
                  {videoOk
                    ? `${probe.video.codec ?? '?'} ${probe.video.resolution ?? ''} @${probe.video.fps ?? '?'}fps`
                    : (probe.video.errorMessage ?? probe.video.errorCode ?? 'failed')}
                </p>
                {tone === 'warning' && (
                  <p className="mt-1 text-muted">
                    You can still activate — continuous health monitoring will verify the live
                    stream.
                  </p>
                )}
              </div>
            );
          })()}
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
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        {isDraft ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={!requiredReady || busy}
              loading={isSaving && !isActivating}
              onClick={() => void handleSaveOnly()}
            >
              Save as draft
            </Button>
            <Button
              size="sm"
              disabled={!requiredReady || busy}
              loading={isActivating}
              onClick={() => void handleSaveAndActivate()}
            >
              Save &amp; activate
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            disabled={!requiredReady || busy}
            loading={isSaving}
            onClick={() => void handleSaveOnly()}
          >
            Save changes
          </Button>
        )}
      </div>
    </AnimatedModal>
  );
}
