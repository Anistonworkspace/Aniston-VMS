import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Input } from '@/components/ui';
import { SELECT_CLASSES } from './cameraConfigForm';
import type { ConfigFormErrors, PlacementValue } from './cameraConfigForm';
import { useListRoutersLiteQuery, useListSitesLiteQuery } from './cameras.api';
import { DELHI_NCR, OSM_RASTER_STYLE } from './mapStyle';
import { areCoordinatesValid, formatCoordinate } from './coordinates';

interface Props {
  value: PlacementValue;
  errors: ConfigFormErrors;
  onChange: (patch: Partial<PlacementValue>) => void;
  disabled?: boolean;
}

// CR-6 — self-contained site/router selects + MapLibre pin picker + manual
// lat/lng inputs, lifted from ConfigureCameraModal's placement block. The map
// effect owns mapRef/markerRef and runs once on mount (no `open`/`camera.id`
// dependency here — the caller remounts this component when needed).
export function CameraPlacementFields({ value, errors, onChange, disabled }: Props): JSX.Element {
  const { data: sites } = useListSitesLiteQuery();
  const { data: routers } = useListRoutersLiteQuery();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  // Mirrors `disabled` for the map's click handler, which is registered once
  // on mount by the effect below — without this ref the handler would keep
  // seeing the `disabled` value captured on the first render forever.
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  // Init the map once; click or drag the marker → push lat/lng strings up via
  // onChange. Mirrors ConfigureCameraModal's map effect: the marker is only
  // added to the map when the camera already has real coordinates, or once
  // the user clicks to place one — an unplaced camera shows no pin.
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const hasCoords = areCoordinatesValid(value.latitude, value.longitude);
    const start: [number, number] = hasCoords
      ? [Number(value.longitude), Number(value.latitude)]
      : DELHI_NCR;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: OSM_RASTER_STYLE,
      center: start,
      zoom: 12,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const marker = new maplibregl.Marker({
      draggable: !disabledRef.current,
      color: '#3f67d8',
    }).setLngLat(start);
    if (hasCoords) {
      marker.addTo(map);
    }
    marker.on('dragend', () => {
      const { lat, lng } = marker.getLngLat();
      onChange({ latitude: formatCoordinate(lat), longitude: formatCoordinate(lng) });
    });
    map.on('click', (event) => {
      if (disabledRef.current) return;
      marker.setLngLat(event.lngLat).addTo(map);
      onChange({
        latitude: formatCoordinate(event.lngLat.lat),
        longitude: formatCoordinate(event.lngLat.lng),
      });
    });
    mapRef.current = map;
    markerRef.current = marker;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the marker's draggability in sync with `disabled` — the mount
  // effect above only sets it once, from the first render's value.
  useEffect(() => {
    markerRef.current?.setDraggable(!disabled);
  }, [disabled]);

  // Text field → pin sync (only when both coordinates are valid).
  const syncPin = (lat: string, lng: string): void => {
    if (markerRef.current && mapRef.current && areCoordinatesValid(lat, lng)) {
      const lngLat: [number, number] = [Number(lng), Number(lat)];
      markerRef.current.setLngLat(lngLat);
      mapRef.current.setCenter(lngLat);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-tertiary">
          Site
          <select
            className={SELECT_CLASSES}
            value={value.siteId}
            disabled={disabled}
            onChange={(e) => onChange({ siteId: e.target.value })}
          >
            <option value="">Select a site…</option>
            {sites?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {errors.siteId && (
            <span className="mt-1 block text-xs text-state-critical">{errors.siteId}</span>
          )}
        </label>
        <label className="text-xs font-medium text-tertiary">
          Router
          <select
            className={SELECT_CLASSES}
            value={value.routerId}
            disabled={disabled}
            onChange={(e) => onChange({ routerId: e.target.value })}
          >
            <option value="">Select a router…</option>
            {routers?.items.map((r) => (
              <option key={r.id} value={r.id}>
                {r.serialNumber} · {r.model}
              </option>
            ))}
          </select>
          {errors.routerId && (
            <span className="mt-1 block text-xs text-state-critical">{errors.routerId}</span>
          )}
        </label>
      </div>

      <div
        ref={mapContainerRef}
        className="h-56 w-full overflow-hidden rounded-lg border border-hairline"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Latitude"
          value={value.latitude}
          error={errors.latitude}
          disabled={disabled}
          onChange={(e) => {
            onChange({ latitude: e.target.value });
            syncPin(e.target.value, value.longitude);
          }}
        />
        <Input
          label="Longitude"
          value={value.longitude}
          error={errors.longitude}
          disabled={disabled}
          onChange={(e) => {
            onChange({ longitude: e.target.value });
            syncPin(value.latitude, e.target.value);
          }}
        />
      </div>
    </div>
  );
}
