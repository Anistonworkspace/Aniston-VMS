import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const h = vi.hoisted(() => {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    handlers,
    marker: {
      setLngLat: vi.fn().mockReturnThis(),
      addTo: vi.fn().mockReturnThis(),
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        handlers[`marker:${event}`] = cb;
      }),
      getLngLat: vi.fn(() => ({ lat: 28.6, lng: 77.2 })),
      remove: vi.fn(),
      setDraggable: vi.fn(),
    },
    map: {
      addControl: vi.fn(),
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        handlers[`map:${event}`] = cb;
      }),
      remove: vi.fn(),
      setCenter: vi.fn(),
      setZoom: vi.fn(),
    },
  };
});
vi.mock('maplibre-gl', () => ({
  default: {
    Map: vi.fn(function () {
      return h.map;
    }),
    Marker: vi.fn(function () {
      return h.marker;
    }),
    NavigationControl: vi.fn(),
  },
}));
vi.mock('./cameras.api', () => ({
  useListSitesLiteQuery: () => ({
    data: {
      items: [
        { id: 'site-1', name: 'HQ' },
        { id: 'site-2', name: 'DC' },
      ],
    },
  }),
  useListRoutersLiteQuery: () => ({
    data: { items: [{ id: 'router-1', serialNumber: 'RTR-9', model: 'X' }] },
  }),
}));

import { CameraPlacementFields } from './CameraPlacementFields';
import type { PlacementValue } from './cameraConfigForm';
import { formatCoordinate } from './coordinates';

const value: PlacementValue = {
  siteId: 'site-1',
  routerId: 'router-1',
  latitude: '28.6',
  longitude: '77.2',
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(h.handlers)) delete h.handlers[key];
});

describe('CameraPlacementFields', () => {
  it('renders site options and emits a patch when the site changes', () => {
    const onChange = vi.fn();
    render(<CameraPlacementFields value={value} errors={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/site/i), { target: { value: 'site-2' } });
    expect(onChange).toHaveBeenCalledWith({ siteId: 'site-2' });
  });

  it('emits lat/lng patch when a coordinate field changes to a valid value', () => {
    const onChange = vi.fn();
    render(<CameraPlacementFields value={value} errors={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/latitude/i), { target: { value: '30.5' } });
    expect(onChange).toHaveBeenCalledWith({ latitude: '30.5' });
  });

  it('places the marker and emits a patch when the map is clicked', () => {
    const onChange = vi.fn();
    render(<CameraPlacementFields value={value} errors={{}} onChange={onChange} />);
    const onMapClick = h.handlers['map:click'];
    expect(onMapClick).toBeDefined();
    onMapClick({ lngLat: { lat: 30.123456, lng: 76.987654 } });
    expect(h.marker.setLngLat).toHaveBeenCalledWith({ lat: 30.123456, lng: 76.987654 });
    expect(h.marker.addTo).toHaveBeenCalledWith(h.map);
    expect(onChange).toHaveBeenCalledWith({
      latitude: formatCoordinate(30.123456),
      longitude: formatCoordinate(76.987654),
    });
  });

  it('does not emit a patch when the map is clicked while disabled', () => {
    const onChange = vi.fn();
    render(<CameraPlacementFields value={value} errors={{}} onChange={onChange} disabled />);
    const onMapClick = h.handlers['map:click'];
    expect(onMapClick).toBeDefined();
    onMapClick({ lngLat: { lat: 30.123456, lng: 76.987654 } });
    expect(onChange).not.toHaveBeenCalled();
  });
});
