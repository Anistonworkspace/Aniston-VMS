import { describe, it, expect, vi } from 'vitest';
import { createCameraPin, type CameraPinData } from '../cameraPin';
import { STATUS_PIN_COLORS } from '../mapStyle';
import type { CameraStatus } from '../cameras.types';

function pinFor(status: CameraStatus, over: Partial<CameraPinData> = {}) {
  const camera: CameraPinData = { id: 'cam-1', name: 'Front Gate', status, ...over };
  return createCameraPin(camera, vi.fn());
}

describe('createCameraPin', () => {
  it('builds an accessible button labelled with the camera name and status', () => {
    const el = pinFor('HEALTHY', { name: 'Lobby' });
    expect(el.tagName).toBe('BUTTON');
    expect(el.type).toBe('button');
    expect(el.getAttribute('aria-label')).toBe('Open Lobby (HEALTHY)');
    expect(el.title).toBe('Lobby · HEALTHY');
    expect(el.dataset.status).toBe('HEALTHY');
  });

  it('drives the pin colour from the shared STATUS_PIN_COLORS tokens', () => {
    expect(pinFor('CRITICAL').style.getPropertyValue('--pin-color')).toBe(
      STATUS_PIN_COLORS.CRITICAL,
    );
    expect(pinFor('MAINTENANCE').style.getPropertyValue('--pin-color')).toBe(
      STATUS_PIN_COLORS.MAINTENANCE,
    );
  });

  it('falls back to the UNKNOWN colour for an unexpected status', () => {
    const el = pinFor('SOMETHING_ELSE' as CameraStatus);
    expect(el.style.getPropertyValue('--pin-color')).toBe(STATUS_PIN_COLORS.UNKNOWN);
  });

  it('renders the nested teardrop svg (motion target), never transforming the root', () => {
    const el = pinFor('HEALTHY');
    expect(el.querySelector('.camera-pin')).not.toBeNull();
    expect(el.querySelector('svg.camera-pin__svg')).not.toBeNull();
    // MapLibre owns the root transform for positioning — we must never set it.
    expect(el.style.transform).toBe('');
  });

  it('adds a pulse only for WARNING (subtle) and CRITICAL (strong)', () => {
    expect(pinFor('WARNING').querySelector('.camera-pin__pulse--warning')).not.toBeNull();
    expect(pinFor('CRITICAL').querySelector('.camera-pin__pulse--critical')).not.toBeNull();
  });

  it('does not add a pulse for calm statuses', () => {
    for (const status of ['HEALTHY', 'MAINTENANCE', 'UNKNOWN'] as CameraStatus[]) {
      expect(pinFor(status).querySelector('.camera-pin__pulse')).toBeNull();
    }
  });

  it('invokes onOpen with the camera id and stops the click from bubbling', () => {
    const onOpen = vi.fn();
    const el = createCameraPin({ id: 'cam-42', name: 'Dock', status: 'HEALTHY' }, onOpen);
    const parent = document.createElement('div');
    const parentClick = vi.fn();
    parent.addEventListener('click', parentClick);
    parent.appendChild(el);

    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onOpen).toHaveBeenCalledExactlyOnceWith('cam-42');
    expect(parentClick).not.toHaveBeenCalled();
  });
});
