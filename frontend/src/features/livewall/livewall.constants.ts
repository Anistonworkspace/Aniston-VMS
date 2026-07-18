import type { LayoutKind } from './livewall.types';

/** Mirrors backend layout.schemas.ts LAYOUT_MAX_CAMERAS. */
export const LAYOUT_MAX_CAMERAS: Record<LayoutKind, number> = {
  L1x1: 1,
  L2x2: 4,
  L3x2: 6,
};

export const KIND_LABEL: Record<LayoutKind, string> = {
  L1x1: '1×1',
  L2x2: '2×2',
  L3x2: '3×2',
};

export const KIND_GRID_CLASS: Record<LayoutKind, string> = {
  L1x1: 'grid-cols-1',
  L2x2: 'grid-cols-1 sm:grid-cols-2',
  L3x2: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
};

export const ALL_KINDS: readonly LayoutKind[] = ['L1x1', 'L2x2', 'L3x2'];

/**
 * Sessions are reaped after STREAM_SESSION_TIMEOUT_SECONDS (default 45,
 * backend/src/config/env.ts) without a heartbeat — beat well inside that.
 */
export const HEARTBEAT_INTERVAL_MS = 20_000;

/** localStorage key for the current (unsaved) wall — survives refreshes. */
export const WALL_STORAGE_KEY = 'vms.livewall.wall';
