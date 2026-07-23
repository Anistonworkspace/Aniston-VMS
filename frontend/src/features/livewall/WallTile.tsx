import type { Camera } from '@/features/cameras/cameras.types';
import { LiveTile } from './LiveTile';
import { SnapshotTile } from './SnapshotTile';
import type { CameraViewMode } from './useCameraViewMode';

export interface WallTileProps {
  camera: Camera;
  viewMode: CameraViewMode;
  onRemove: () => void;
}

/**
 * A single Live Wall cell, rendered as either the live stream (LiveTile —
 * untouched) or the latest stored screenshot (SnapshotTile), driven by the
 * wall-wide view mode. Pure additive branch: it never alters, wraps, or
 * short-circuits the existing streaming/playback path.
 */
export function WallTile({ camera, viewMode, onRemove }: WallTileProps): JSX.Element {
  return viewMode === 'screenshots' ? (
    <SnapshotTile camera={camera} onRemove={onRemove} />
  ) : (
    <LiveTile camera={camera} onRemove={onRemove} />
  );
}
