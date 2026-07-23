import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Camera } from '@/features/cameras/cameras.types';
import { WallTile } from './WallTile';

// Stub both tiles so the test asserts *which* one renders per view mode,
// without pulling in streaming/query internals.
vi.mock('./LiveTile', () => ({
  LiveTile: () => <div data-testid="live-tile" />,
}));
vi.mock('./SnapshotTile', () => ({
  SnapshotTile: () => <div data-testid="snapshot-tile" />,
}));

const camera = { id: 'cam-1', cameraCode: 'CAM-001', name: 'Front Door' } as unknown as Camera;

describe('WallTile', () => {
  it('renders the live stream tile in "stream" mode', () => {
    render(<WallTile camera={camera} viewMode="stream" onRemove={vi.fn()} />);
    expect(screen.getByTestId('live-tile')).toBeInTheDocument();
    expect(screen.queryByTestId('snapshot-tile')).not.toBeInTheDocument();
  });

  it('renders the snapshot tile in "screenshots" mode', () => {
    render(<WallTile camera={camera} viewMode="screenshots" onRemove={vi.fn()} />);
    expect(screen.getByTestId('snapshot-tile')).toBeInTheDocument();
    expect(screen.queryByTestId('live-tile')).not.toBeInTheDocument();
  });
});
