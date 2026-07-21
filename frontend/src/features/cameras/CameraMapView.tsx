import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Camera } from './cameras.types';
import { DELHI_NCR, OSM_RASTER_STYLE, STATUS_PIN_COLORS } from './mapStyle';
import { createCameraPin } from './cameraPin';

interface CameraMapViewProps {
  cameras: Camera[];
  onOpen: (id: string) => void;
}

// CR-6 — MapLibre fleet map. Every camera renders as a 3D teardrop CCTV pin
// (see cameraPin.ts) at its registered WGS-84 position; clicking a pin opens the
// same health drawer the grid cards use. Markers are DOM buttons so they stay
// keyboard-reachable, and use anchor "bottom" so the tip sits on the coordinate.
export function CameraMapView({ cameras, onOpen }: CameraMapViewProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  // Ref'd so marker click handlers never capture a stale navigate closure.
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  // Create the map once per mount.
  useEffect(() => {
    if (!containerRef.current) return undefined;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_RASTER_STYLE,
      center: DELHI_NCR,
      zoom: 9,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, []);

  // Diff-free marker sync: wipe and re-add whenever the filtered list changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    const bounds = new maplibregl.LngLatBounds();
    cameras.forEach((camera) => {
      if (!Number.isFinite(camera.latitude) || !Number.isFinite(camera.longitude)) return;
      const el = createCameraPin(camera, (id) => onOpenRef.current(id));
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([camera.longitude, camera.latitude])
        .addTo(map);
      markersRef.current.push(marker);
      bounds.extend([camera.longitude, camera.latitude]);
    });

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 400 });
    }
  }, [cameras]);

  return (
    <div className="relative overflow-hidden rounded-card shadow-soft" data-testid="camera-map">
      <div
        ref={containerRef}
        className="h-[520px] w-full"
        role="application"
        aria-label="Camera fleet map"
      />
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-2 rounded-full bg-card px-3 py-1.5 shadow-soft">
        {(Object.entries(STATUS_PIN_COLORS) as Array<[string, string]>).map(([status, color]) => (
          <span
            key={status}
            className="flex items-center gap-1 text-[10px] font-medium text-tertiary"
          >
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            {status.charAt(0) + status.slice(1).toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  );
}
