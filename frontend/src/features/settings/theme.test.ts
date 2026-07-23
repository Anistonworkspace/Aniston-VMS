import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  THEME_STORAGE_KEY,
  DEFAULT_PREFS,
  readStoredPrefs,
  writeStoredPrefs,
  resolveIsDark,
  applyPrefsToDocument,
  subscribeSystemTheme,
  systemPrefersDark,
} from './theme';

/**
 * jsdom does not implement window.matchMedia. Install a controllable fake so we
 * can drive the "system" theme and fire live `change` events like a real OS
 * theme switch would.
 */
function installMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  let matches = initialMatches;
  const mql = {
    get matches() {
      return matches;
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
    // legacy API, unused here
    addListener: (cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
    removeListener: (cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
    dispatchEvent: () => true,
  };
  const matchMedia = vi.fn().mockReturnValue(mql);
  vi.stubGlobal('matchMedia', matchMedia);
  // Also mirror onto window for code paths that read window.matchMedia.
  Object.defineProperty(window, 'matchMedia', { value: matchMedia, configurable: true, writable: true });
  return {
    setMatches(next: boolean) {
      matches = next;
      const event = { matches: next, media: mql.media } as MediaQueryListEvent;
      listeners.forEach((cb) => cb(event));
    },
    listenerCount: () => listeners.size,
    matchMedia,
  };
}

describe('theme: resolveIsDark', () => {
  it('light mode is never dark regardless of system preference', () => {
    expect(resolveIsDark('light', true)).toBe(false);
    expect(resolveIsDark('light', false)).toBe(false);
  });

  it('dark mode is always dark regardless of system preference', () => {
    expect(resolveIsDark('dark', false)).toBe(true);
    expect(resolveIsDark('dark', true)).toBe(true);
  });

  it('system mode follows the OS preference', () => {
    expect(resolveIsDark('system', true)).toBe(true);
    expect(resolveIsDark('system', false)).toBe(false);
  });
});

describe('theme: read/write persistence', () => {
  beforeEach(() => window.localStorage.clear());

  it('returns defaults when nothing is stored', () => {
    expect(readStoredPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('round-trips a full preference object through localStorage', () => {
    const prefs = { theme: 'dark', density: 'compact', reduceMotion: true } as const;
    writeStoredPrefs(prefs);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toContain('dark');
    expect(readStoredPrefs()).toEqual(prefs);
  });

  it('merges partial stored prefs onto defaults (forward-compatible)', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ theme: 'dark' }));
    expect(readStoredPrefs()).toEqual({ ...DEFAULT_PREFS, theme: 'dark' });
  });

  it('falls back to defaults on corrupt JSON', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, '{not-json');
    expect(readStoredPrefs()).toEqual(DEFAULT_PREFS);
  });
});

describe('theme: applyPrefsToDocument', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('data-density');
    document.documentElement.removeAttribute('data-reduce-motion');
    vi.unstubAllGlobals();
  });

  it('adds the .dark class for the dark theme', () => {
    applyPrefsToDocument({ theme: 'dark', density: 'comfortable', reduceMotion: false });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes the .dark class for the light theme', () => {
    document.documentElement.classList.add('dark');
    applyPrefsToDocument({ theme: 'light', density: 'comfortable', reduceMotion: false });
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('follows the OS preference for the system theme', () => {
    installMatchMedia(true);
    applyPrefsToDocument({ theme: 'system', density: 'comfortable', reduceMotion: false });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('reflects density and reduce-motion as data attributes', () => {
    applyPrefsToDocument({ theme: 'light', density: 'compact', reduceMotion: true });
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
    expect(document.documentElement.getAttribute('data-reduce-motion')).toBe('true');
  });
});

describe('theme: subscribeSystemTheme (live OS changes)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('invokes the listener when the OS theme changes and can unsubscribe', () => {
    const mm = installMatchMedia(false);
    const listener = vi.fn();
    const unsubscribe = subscribeSystemTheme(listener);

    mm.setMatches(true);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(mm.listenerCount()).toBe(0);
    mm.setMatches(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('degrades gracefully when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    Object.defineProperty(window, 'matchMedia', { value: undefined, configurable: true, writable: true });
    expect(systemPrefersDark()).toBe(false);
    expect(() => subscribeSystemTheme(vi.fn())()).not.toThrow();
  });
});
