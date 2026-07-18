import { useCallback, useEffect, useState } from 'react';

// Local-only preferences — there is no backend endpoint for appearance
// (backend/src/modules/** has no settings/preferences module), so these are
// persisted to localStorage and applied as attributes on <html>. Tailwind's
// `darkMode: 'class'` (tailwind.config.js) makes the theme toggle a real,
// functioning Tailwind dark-mode switch rather than a decorative no-op.
export type ThemeMode = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';

export interface AppearancePrefs {
  theme: ThemeMode;
  density: Density;
  reduceMotion: boolean;
}

const STORAGE_KEY = 'aniston-vms:appearance-prefs';

const DEFAULT_PREFS: AppearancePrefs = {
  theme: 'system',
  density: 'comfortable',
  reduceMotion: false,
};

function readStoredPrefs(): AppearancePrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<AppearancePrefs>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}

function applyPrefsToDocument(prefs: AppearancePrefs) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const isDark = prefs.theme === 'dark' || (prefs.theme === 'system' && prefersDark);
  root.classList.toggle('dark', isDark);
  root.setAttribute('data-density', prefs.density);
  root.setAttribute('data-reduce-motion', String(prefs.reduceMotion));
}

export function useAppearancePrefs() {
  const [prefs, setPrefs] = useState<AppearancePrefs>(() => readStoredPrefs());

  useEffect(() => {
    applyPrefsToDocument(prefs);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // localStorage unavailable (private mode / quota) — preference just won't persist.
    }
  }, [prefs]);

  const update = useCallback(
    <K extends keyof AppearancePrefs>(key: K, value: AppearancePrefs[K]) => {
      setPrefs((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  return { prefs, update };
}
