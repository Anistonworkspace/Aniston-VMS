import type { CameraStatus } from './cameras.types';
import { STATUS_PIN_COLORS } from './mapStyle';
import './cameraPin.css';

// CR-6 — reusable 3D teardrop CCTV pin for the MapLibre fleet map. Replaces the
// old flat status dot. The returned <button> is handed straight to a MapLibre
// Marker with anchor "bottom", so its pointed tip sits exactly on the camera's
// WGS-84 coordinate.
//
// IMPORTANT: MapLibre owns the root element's `transform` for positioning, so
// every hover/scale/pulse animation lives on the NESTED `.camera-pin` element —
// the root is never transformed by us. This keeps the tip pinned to the exact
// coordinate while zooming, panning, hovering and selecting.

/** Minimal shape the pin needs; `Camera` satisfies it structurally. */
export interface CameraPinData {
  id: string;
  name: string;
  status: CameraStatus;
}

/** Statuses that get an animated attention pulse (reduced-motion disables it). */
const PULSE_BY_STATUS: Partial<Record<CameraStatus, 'warning' | 'critical'>> = {
  WARNING: 'warning',
  CRITICAL: 'critical',
};

// Single teardrop silhouette, reused for the extruded edge and the shell so the
// two layers register perfectly. Tip is at the exact bottom-centre (18, 46).
const TEARDROP =
  'M18 46 C11.5 35.5 4 28.5 4 17 A14 14 0 1 1 32 17 C32 28.5 24.5 35.5 18 46 Z';

// Bevelled teardrop shell + recessed charcoal lens well + white CCTV glyph.
// Colours come from CSS custom properties (--pin-color / --pin-edge) so the pin
// stays theme-aware and reuses the existing --status-* design tokens.
const PIN_SVG = `
<svg class="camera-pin__svg" viewBox="0 0 36 46" width="36" height="46" aria-hidden="true" focusable="false">
  <path d="${TEARDROP}" transform="translate(1.4 2.2)" fill="var(--pin-edge, #1f2a3a)"/>
  <path d="${TEARDROP}" fill="var(--pin-color, #9aa1a9)"/>
  <ellipse cx="13" cy="11" rx="6" ry="3.4" transform="rotate(-35 13 11)" fill="rgba(255,255,255,0.40)"/>
  <ellipse cx="24" cy="25" rx="7" ry="4" transform="rotate(-35 24 25)" fill="rgba(2,6,23,0.16)"/>
  <circle cx="18" cy="17" r="10" fill="rgba(2,6,23,0.55)"/>
  <circle cx="18" cy="17.7" r="8.9" fill="#232b3a"/>
  <path d="M9.6 21.2 A9 9 0 0 0 26.4 21.2" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="1.2"/>
  <g transform="translate(11.8 7.9) scale(0.62)" fill="#ffffff">
    <path d="M5 10.5 h9.5 a2 2 0 0 1 2 2 v1.8 a2 2 0 0 1 -2 2 h-9.5 a1.6 1.6 0 0 1 -1.6 -1.6 v-2.6 a1.6 1.6 0 0 1 1.6 -1.6 z"/>
    <circle cx="16.1" cy="13.4" r="1.7" fill="#c9d4e3"/>
    <path d="M5 9.2 h7.3 a1 1 0 0 1 1 1 v0.3 h-9.3 v-0.3 a1 1 0 0 1 1 -1 z"/>
    <rect x="8.9" y="16.3" width="1.7" height="2.5" rx="0.85"/>
    <rect x="6.1" y="18.5" width="7.3" height="1.7" rx="0.85"/>
  </g>
</svg>`;

/**
 * Build a status-coloured 3D teardrop pin element for a single camera.
 *
 * @param camera - camera id/name/status used for colour, label and click target
 * @param onOpen - invoked with the camera id when the pin is activated
 */
export function createCameraPin(
  camera: CameraPinData,
  onOpen: (id: string) => void,
): HTMLButtonElement {
  const { status } = camera;
  const color = STATUS_PIN_COLORS[status] ?? STATUS_PIN_COLORS.UNKNOWN;

  const root = document.createElement('button');
  root.type = 'button';
  root.className = 'camera-pin-root';
  root.dataset.status = status;
  // Drives both the shell fill and (via color-mix) the darker extruded edge.
  root.style.setProperty('--pin-color', color);
  root.title = `${camera.name} · ${status}`;
  root.setAttribute('aria-label', `Open ${camera.name} (${status})`);

  const pulse = PULSE_BY_STATUS[status];
  const pulseMarkup = pulse
    ? `<span class="camera-pin__pulse camera-pin__pulse--${pulse}" aria-hidden="true"></span>`
    : '';

  root.innerHTML = `<span class="camera-pin" data-testid="camera-pin">${pulseMarkup}${PIN_SVG}</span>`;

  root.addEventListener('click', (event) => {
    // Keep the click from reaching the map so it doesn't deselect/close things.
    event.stopPropagation();
    onOpen(camera.id);
  });

  return root;
}
