import { useEffect, useState } from 'react';

/** Live Wall render mode: the live camera stream, or the latest stored screenshot. */
export type CameraViewMode = 'stream' | 'screenshots';

const STORAGE_KEY = 'aniston-vms:camera-view-mode';
// New users land on Screenshots — the low-bandwidth, always-available view the
// approved Live Wall design defaults to. Once a user picks a mode it is
// persisted below and restored ahead of this default on their next visit.
const DEFAULT_MODE: CameraViewMode = 'screenshots';

function isCameraViewMode(value: unknown): value is CameraViewMode {
  return value === 'stream' || value === 'screenshots';
}

function readStoredMode(): CameraViewMode {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isCameraViewMode(raw) ? raw : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

/**
 * The wall-wide "Camera Stream vs Screenshots" view mode, persisted to
 * localStorage so the choice survives refreshes and applies to every tile.
 * Mirrors the lazy-init + try/catch read/write shape of `useAppearancePrefs`
 * (private-mode / quota safe). Only a UI enum string is stored — no server
 * data, tokens, or PII (rule-frontend).
 */
export function useCameraViewMode(): [CameraViewMode, (mode: CameraViewMode) => void] {
  const [mode, setMode] = useState<CameraViewMode>(() => readStoredMode());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // localStorage unavailable (private mode / quota) — preference just won't persist.
    }
  }, [mode]);

  return [mode, setMode];
}
