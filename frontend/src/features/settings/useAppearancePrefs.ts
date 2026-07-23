import { createContext, useContext } from 'react';
import type { AppearancePrefs } from './theme';

// Re-export the token types so existing consumers (e.g. AppearancePanel) keep
// importing them from here; the single source of truth lives in ./theme.
export type { AppearancePrefs, ThemeMode, Density } from './theme';

export interface AppearanceContextValue {
  prefs: AppearancePrefs;
  update: <K extends keyof AppearancePrefs>(key: K, value: AppearancePrefs[K]) => void;
}

/**
 * Shared context for the app-wide appearance preferences. Created in this
 * (non-component) module so both <AppearanceProvider> and the
 * useAppearancePrefs hook can reference the same instance without either file
 * having to export both a component and a hook — the mix that would break
 * React Fast Refresh.
 */
export const AppearanceContext = createContext<AppearanceContextValue | null>(null);

/**
 * Read the shared appearance preferences and an `update(key, value)` setter.
 * Must be called under an <AppearanceProvider>.
 */
export function useAppearancePrefs(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    throw new Error('useAppearancePrefs must be used within an <AppearanceProvider>');
  }
  return ctx;
}
