import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Camera } from '../cameras.types';
import { CameraMapView } from '../CameraMapView';

// Shared spies/records, accessible from inside the hoisted mock factory.
const h = vi.hoisted(() => ({
  markers: [] as Array<{ element: HTMLElement; anchor: unknown; lngLat: unknown }>,
  mapOptions: [] as Array<Record<string, unknown>>,
  fitBounds: vi.fn(),
  addControl: vi.fn(),
  removeMap: vi.fn(),
  resize: vi.fn(),
}));

vi.mock('maplibre-gl', () => {
  class Map {
    addControl = h.addControl;
    fitBounds = h.fitBounds;
    remove = h.removeMap;
    resize = h.resize;
    constructor(opts: Record<string, unknown>) {
      h.mapOptions.push(opts);
    }
  }
  class NavigationControl {}
  class LngLatBounds {
    pts: unknown[] = [];
    extend(p: unknown) {
      this.pts.push(p);
      return this;
    }
    isEmpty() {
      return this.pts.length === 0;
    }
  }
  class Marker {
    element: HTMLElement;
    rec: { element: HTMLElement; anchor: unknown; lngLat: unknown };
    constructor(opts: { element: HTMLElement; anchor?: unknown }) {
      this.element = opts.element;
      this.rec = { element: opts.element, anchor: opts.anchor, lngLat: null };
      h.markers.push(this.rec);
    }
    setLngLat(v: unknown) {
      this.rec.lngLat = v;
      return this;
    }
    addTo() {
      document.body.appendChild(this.element);
      return this;
    }
    remove() {
      this.element.remove();
    }
  }
  return { default: { Map, NavigationControl, LngLatBounds, Marker } };
});

function makeCamera(over: Partial<Camera>): Camera {
  return {
    id: 'x',
    name: 'Cam',
    status: 'HEALTHY',
    latitude: 28.6,
    longitude: 77.2,
    ...over,
  } as unknown as Camera;
}

beforeEach(() => {
  h.markers.length = 0;
  h.mapOptions.length = 0;
  h.fitBounds.mockClear();
  h.addControl.mockClear();
  document.body.innerHTML = '';
});

describe('CameraMapView', () => {
  it('renders one bottom-anchored pin per camera with valid coordinates', () => {
    const cameras = [
      makeCamera({ id: 'c1', name: 'Alpha', latitude: 28.6, longitude: 77.2 }),
      makeCamera({ id: 'c2', name: 'Bravo', status: 'CRITICAL', latitude: 28.7, longitude: 77.3 }),
    ];

    render(<CameraMapView cameras={cameras} onOpen={vi.fn()} />);

    expect(h.markers).toHaveLength(2);
    expect(h.markers.every((m) => m.anchor === 'bottom')).toBe(true);
    // [lng, lat] order preserved for MapLibre.
    expect(h.markers[0].lngLat).toEqual([77.2, 28.6]);
    expect(h.fitBounds).toHaveBeenCalledTimes(1);
  });

  it('skips cameras with missing or non-finite coordinates', () => {
    const cameras = [
      makeCamera({ id: 'good', latitude: 28.6, longitude: 77.2 }),
      makeCamera({ id: 'nan', latitude: Number.NaN, longitude: 77.2 }),
      makeCamera({ id: 'bad', latitude: 28.6, longitude: Number.POSITIVE_INFINITY }),
    ];

    render(<CameraMapView cameras={cameras} onOpen={vi.fn()} />);

    expect(h.markers).toHaveLength(1);
  });

  it('calls onOpen with the camera id when its pin is clicked', () => {
    const onOpen = vi.fn();
    render(
      <CameraMapView cameras={[makeCamera({ id: 'c9', name: 'Nine' })]} onOpen={onOpen} />,
    );

    h.markers[0].element.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onOpen).toHaveBeenCalledExactlyOnceWith('c9');
  });

  it('does not fit bounds when there are no plottable cameras', () => {
    render(<CameraMapView cameras={[]} onOpen={vi.fn()} />);
    expect(h.markers).toHaveLength(0);
    expect(h.fitBounds).not.toHaveBeenCalled();
  });

  it('keeps the status legend', () => {
    render(<CameraMapView cameras={[]} onOpen={vi.fn()} />);
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
  });

  it('uses a permanent (non-compact) attribution control, not the circular "i" button', () => {
    render(<CameraMapView cameras={[]} onOpen={vi.fn()} />);
    expect(h.mapOptions).toHaveLength(1);
    // compact:false is what renders the always-visible OSM credit instead of
    // the collapsed "i" toggle on desktop and mobile.
    expect(h.mapOptions[0].attributionControl).toEqual({ compact: false });
  });
});

describe('CameraMapView fullscreen button', () => {
  afterEach(() => {
    // The Fullscreen API is not implemented in jsdom; scrub the shims we install
    // so they never leak into unrelated suites.
    delete (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen;
    delete (document as { exitFullscreen?: unknown }).exitFullscreen;
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      configurable: true,
      writable: true,
    });
  });

  it('renders a labelled fullscreen toggle button', () => {
    render(<CameraMapView cameras={[]} onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: /enter fullscreen/i })).toBeInTheDocument();
  });

  it('requests fullscreen on the map wrapper when clicked', () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen =
      requestFullscreen;

    render(<CameraMapView cameras={[]} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /enter fullscreen/i }));

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    // The element that goes fullscreen is the map wrapper, so the legend and the
    // toggle itself stay visible in the fullscreen view.
    expect(requestFullscreen.mock.instances[0]).toBe(screen.getByTestId('camera-map'));
  });

  it('swaps to an exit control and exits fullscreen on the next click', () => {
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    (document as { exitFullscreen?: unknown }).exitFullscreen = exitFullscreen;

    render(<CameraMapView cameras={[]} onOpen={vi.fn()} />);
    const wrapper = screen.getByTestId('camera-map');

    // Simulate the browser entering fullscreen (e.g. our request resolved).
    Object.defineProperty(document, 'fullscreenElement', {
      value: wrapper,
      configurable: true,
      writable: true,
    });
    fireEvent(document, new Event('fullscreenchange'));

    const exitButton = screen.getByRole('button', { name: /exit fullscreen/i });
    expect(exitButton).toBeInTheDocument();

    fireEvent.click(exitButton);
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    // Map resizes to the new viewport whenever fullscreen state changes.
    expect(h.resize).toHaveBeenCalled();
  });
});
