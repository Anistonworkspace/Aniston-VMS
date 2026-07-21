import type { StyleSpecification } from 'maplibre-gl';
import type { CameraStatus } from './cameras.types';

// CR-6 — shared MapLibre plumbing for the fleet map and the add-camera pin
// picker. A raster OSM basemap keeps things dependency-light: no vector
// glyphs/sprites to fetch, so the map renders even when only tile traffic is
// allowed through the corporate proxy.
export const OSM_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

/** [lng, lat] — Delhi NCR, the pilot fleet's home; used before any pin exists. */
export const DELHI_NCR: [number, number] = [77.209, 28.6139];

/** Pin fills matching the CameraStatusBadge palette (semantic status tokens). */
export const STATUS_PIN_COLORS: Record<CameraStatus, string> = {
  HEALTHY: 'var(--status-healthy)',
  WARNING: 'var(--status-warning)',
  CRITICAL: 'var(--status-critical)',
  MAINTENANCE: 'var(--status-maintenance)',
  UNKNOWN: 'var(--status-unknown)',
};
