import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Maximize, Minimize } from 'lucide-react';
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Ref'd so marker click handlers never capture a stale navigate closure.
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  // Mirror the browser's fullscreen state so the icon/label stay correct even
  // when the user leaves via Esc (which fires fullscreenchange without our
  // button). The map must recompute its size after the viewport changes.
  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(document.fullscreenElement === rootRef.current);
      mapRef.current?.resize();
    };
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    if (document.fullscreenElement === root) {
      void document.exitFullscreen?.();
    } else {
      void root.requestFullscreen?.();
    }
  }, []);

  // Create the map once per mount.
  useEffect(() => {
    if (!containerRef.current) return undefined;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_RASTER_STYLE,
      center: DELHI_NCR,
      zoom: 9,
      // Permanent, non-collapsing OSM credit at bottom-right (default position)
      // instead of the circular "i" toggle. compact:false keeps the full
      // "© OpenStreetMap contributors" line visible on desktop and mobile.
      attributionControl: { compact: false },
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
      const longitude = camera.longitude;
      const latitude = camera.latitude;
      if (longitude === null || latitude === null) return;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      const el = createCameraPin(camera, (id) => onOpenRef.current(id));
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([longitude, latitude])
        .addTo(map);
      markersRef.current.push(marker);
      bounds.extend([longitude, latitude]);
    });

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 400 });
    }
  }, [cameras]);

  return (
    <div
      ref={rootRef}
      className="relative overflow-hidden rounded-card bg-card shadow-soft"
      data-testid="camera-map"
    >
      <div
        ref={containerRef}
        className="h-full min-h-[520px] w-full"
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
      <button
        type="button"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        aria-pressed={isFullscreen}
        title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        // Sits above the permanent OSM attribution in the bottom-right corner.
        className="absolute bottom-8 right-2 z-10 grid h-8 w-8 place-items-center rounded-md bg-card text-tertiary shadow-soft transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {isFullscreen ? (
          <Minimize aria-hidden className="h-4 w-4" />
        ) : (
          <Maximize aria-hidden className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
