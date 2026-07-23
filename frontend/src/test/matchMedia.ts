import { vi } from 'vitest';

/**
 * jsdom does not implement window.matchMedia. Install a controllable fake so
 * tests can drive the OS "system" color-scheme preference and fire live
 * `change` events exactly like a real OS theme switch would.
 */
export function installMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  let matches = initialMatches;
  const mql = {
    get matches() {
      return matches;
    },
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
    addListener: (cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
    removeListener: (cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
    dispatchEvent: () => true,
  };
  const matchMedia = vi.fn().mockReturnValue(mql);
  vi.stubGlobal('matchMedia', matchMedia);
  Object.defineProperty(window, 'matchMedia', {
    value: matchMedia,
    configurable: true,
    writable: true,
  });
  return {
    /** Flip the OS preference and notify subscribers, like the OS theme changing live. */
    setMatches(next: boolean) {
      matches = next;
      const event = { matches: next, media: mql.media } as MediaQueryListEvent;
      listeners.forEach((cb) => cb(event));
    },
    listenerCount: () => listeners.size,
    matchMedia,
  };
}
