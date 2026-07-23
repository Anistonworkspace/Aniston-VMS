import { useCallback, useEffect, useState } from 'react';

// Desktop sidebar collapse state, persisted so the user's choice survives
// reloads and new sessions. Only relevant at the `lg` breakpoint and up — on
// smaller screens the sidebar is hidden and navigation uses the mobile drawer.
const STORAGE_KEY = 'aniston-vms:sidebar-collapsed';

function readInitial(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    // Storage can throw in private mode / when disabled — default to expanded.
    return false;
  }
}

export interface SidebarCollapseState {
  collapsed: boolean;
  toggle: () => void;
  expand: () => void;
  collapse: () => void;
}

export function useSidebarCollapsed(): SidebarCollapseState {
  const [collapsed, setCollapsed] = useState<boolean>(readInitial);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      // Ignore persistence failures — the in-memory state still works.
    }
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((value) => !value), []);
  const expand = useCallback(() => setCollapsed(false), []);
  const collapse = useCallback(() => setCollapsed(true), []);

  return { collapsed, toggle, expand, collapse };
}
