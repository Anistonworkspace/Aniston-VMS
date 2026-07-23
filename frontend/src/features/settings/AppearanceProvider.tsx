import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  applyPrefsToDocument,
  readStoredPrefs,
  subscribeSystemTheme,
  writeStoredPrefs,
  type AppearancePrefs,
} from './theme';
import { AppearanceContext, type AppearanceContextValue } from './useAppearancePrefs';

/**
 * App-wide Appearance provider. Holds the single copy of the user's theme /
 * density / motion preferences and applies them to <html> globally, so the
 * choice made in Settings → Appearance takes effect across the entire app
 * (the old per-component hook only styled wherever it happened to be mounted).
 *
 * Mount it once, high in the tree (see main.tsx). On mount it applies the saved
 * preference immediately; while the mode is `system` it live-follows the OS.
 *
 * This component lives in its own module (separate from the useAppearancePrefs
 * hook and the context) so no file exports both a component and a non-component
 * — the mix that breaks React Fast Refresh.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<AppearancePrefs>(() => readStoredPrefs());

  // Apply + persist on mount and on every change. Running on mount is what makes
  // a saved 'dark' preference take effect before the user touches anything.
  useEffect(() => {
    applyPrefsToDocument(prefs);
    writeStoredPrefs(prefs);
  }, [prefs]);

  // Live-follow the OS color scheme, but ONLY while the mode is 'system'. Once
  // the user explicitly picks Light or Dark we stop listening, so an OS flip can
  // no longer override their explicit choice.
  useEffect(() => {
    if (prefs.theme !== 'system') return undefined;
    return subscribeSystemTheme(() => applyPrefsToDocument(prefs));
  }, [prefs]);

  const update = useCallback(
    <K extends keyof AppearancePrefs>(key: K, value: AppearancePrefs[K]) => {
      setPrefs((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const value = useMemo<AppearanceContextValue>(() => ({ prefs, update }), [prefs, update]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
