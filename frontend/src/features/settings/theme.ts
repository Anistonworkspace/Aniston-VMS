// Single source of truth for the Appearance theme system.
//
// There is no backend endpoint for appearance (backend/src/modules/** has no
// settings/preferences module), so the selected preference is persisted to
// localStorage and applied as a `.dark` class + data-attributes on <html>.
// Tailwind's `darkMode: 'class'` (tailwind.config.js) turns that class into a
// real dark-mode switch, and globals.css supplies the dark values for the
// Aniston design tokens the whole UI renders with.
//
// These helpers are intentionally pure/DOM-only (no React) so the same logic
// can run in three places without drift:
//   1. the inline <script> in index.html (applied before React paints — no flash)
//   2. the AppearanceProvider (global, live, reactive)
//   3. unit tests
export type ThemeMode = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';

export interface AppearancePrefs {
  theme: ThemeMode;
  density: Density;
  reduceMotion: boolean;
}

export const THEME_STORAGE_KEY = 'aniston-vms:appearance-prefs';

export const DEFAULT_PREFS: AppearancePrefs = {
  theme: 'system',
  density: 'comfortable',
  reduceMotion: false,
};

const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';

/** Whether the OS currently prefers a dark color scheme. Safe when matchMedia is absent. */
export function systemPrefersDark(): boolean {
  return window.matchMedia?.(SYSTEM_DARK_QUERY).matches ?? false;
}

/** Resolve whether the effective theme is dark, given the mode and the live OS preference. */
export function resolveIsDark(theme: ThemeMode, prefersDark: boolean): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return prefersDark; // 'system'
}

export function readStoredPrefs(): AppearancePrefs {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<AppearancePrefs>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writeStoredPrefs(prefs: AppearancePrefs): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage unavailable (private mode / quota) — preference just won't persist.
  }
}

/** Apply the resolved theme + density/motion prefs to <html>. */
export function applyPrefsToDocument(prefs: AppearancePrefs): void {
  const root = document.documentElement;
  const isDark = resolveIsDark(prefs.theme, systemPrefersDark());
  root.classList.toggle('dark', isDark);
  root.setAttribute('data-density', prefs.density);
  root.setAttribute('data-reduce-motion', String(prefs.reduceMotion));
}

/**
 * Subscribe to live OS color-scheme changes (so the `system` option reacts
 * immediately when the user flips their OS theme). Returns an unsubscribe fn.
 */
export function subscribeSystemTheme(listener: () => void): () => void {
  const mql = window.matchMedia?.(SYSTEM_DARK_QUERY);
  if (!mql) return () => {};
  const handler = () => listener();
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}
