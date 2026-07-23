import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { Camera } from '@/features/cameras/cameras.types';
import { HEARTBEAT_INTERVAL_MS } from './livewall.constants';

// Real WallTile + real LiveTile + real SnapshotTile: only their leaf
// dependencies (stream mutations, the HLS player, the snapshot query) are
// mocked, so this exercises the *actual* mode-switch teardown path rather than
// a stub. It proves that switching the wall to Screenshots unmounts the live
// tile and that no heartbeat or stream-session requests keep running after it.
const startTrigger = vi.fn(() => ({
  unwrap: () => Promise.resolve({ id: 'sess-1', hlsUrl: 'blob:mock-stream' }),
}));
const heartbeatTrigger = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const endStreamTrigger = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));

vi.mock('./livewall.api', () => ({
  useStartStreamMutation: () => [startTrigger],
  useStreamHeartbeatMutation: () => [heartbeatTrigger],
  useEndStreamMutation: () => [endStreamTrigger],
}));

vi.mock('./HlsPlayer', () => ({
  HlsPlayer: () => <div data-testid="hls-player" />,
}));

vi.mock('@/features/cameras/cameras.api', () => ({
  useListCameraSnapshotsQuery: () => ({
    data: [],
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

import { WallTile } from './WallTile';

const camera = {
  id: 'cam-1',
  cameraCode: 'CAM-001',
  name: 'Front Door',
} as unknown as Camera;

beforeEach(() => {
  vi.useFakeTimers();
  startTrigger.mockClear();
  heartbeatTrigger.mockClear();
  endStreamTrigger.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WallTile teardown on mode switch', () => {
  it('unmounts the live tile and stops its heartbeat/stream requests when switching to Screenshots', async () => {
    const { rerender } = render(
      <WallTile camera={camera} viewMode="stream" onRemove={vi.fn()} />
    );

    // The stream session opens and the live player mounts.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(startTrigger).toHaveBeenCalledWith({ cameraId: 'cam-1', kind: 'LIVE_SUB' });
    expect(screen.getByTestId('hls-player')).toBeInTheDocument();

    // The heartbeat keeps the session alive on its interval.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
    });
    expect(heartbeatTrigger).toHaveBeenCalledWith({ id: 'sess-1' });
    const heartbeatsBeforeSwitch = heartbeatTrigger.mock.calls.length;

    // Switch the wall to Screenshots.
    rerender(<WallTile camera={camera} viewMode="screenshots" onRemove={vi.fn()} />);

    // The live tile is gone; the snapshot tile has taken its place. Assert on
    // the SnapshotTile-only refresh control (LiveTile has no such button), which
    // is present regardless of snapshot data state — the empty `data: []` fixture
    // renders "No recent screenshot", never a literal "Screenshot" node.
    expect(screen.queryByTestId('hls-player')).not.toBeInTheDocument();
    expect(
      screen.getByLabelText('Refresh screenshot for Front Door')
    ).toBeInTheDocument();

    // The session was released on unmount...
    expect(endStreamTrigger).toHaveBeenCalledWith({ id: 'sess-1', reason: 'tile closed' });

    // ...and the heartbeat interval was cleared: advancing well past several
    // intervals fires no further heartbeat or stream-session requests.
    const startsAfterSwitch = startTrigger.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 3);
    });
    expect(heartbeatTrigger).toHaveBeenCalledTimes(heartbeatsBeforeSwitch);
    expect(startTrigger).toHaveBeenCalledTimes(startsAfterSwitch);
  });
});
