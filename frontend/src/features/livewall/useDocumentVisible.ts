import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

function getSnapshot(): boolean {
  return document.visibilityState === 'visible';
}

// SSR / non-DOM render: assume visible so data loads on first paint.
function getServerSnapshot(): boolean {
  return true;
}

/**
 * `true` while the browser tab is foregrounded, tracking the Page Visibility
 * API via `useSyncExternalStore` (no effect flicker; re-renders on change).
 * Lets callers pause background work — e.g. RTK Query polling — while the tab
 * is hidden.
 */
export function useDocumentVisible(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
