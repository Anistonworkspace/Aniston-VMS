import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Camera } from '@/features/cameras/cameras.types';
import type { SnapshotItem } from '@/features/cameras/cameras.types';
import { SnapshotTile } from './SnapshotTile';
import { SNAPSHOT_POLL_MS } from './livewall.constants';

vi.mock('@/features/cameras/cameras.api', () => ({
  useListCameraSnapshotsQuery: vi.fn(),
}));

import { useListCameraSnapshotsQuery } from '@/features/cameras/cameras.api';

const mockQuery = vi.mocked(useListCameraSnapshotsQuery);

const camera = {
  id: 'cam-1',
  cameraCode: 'CAM-001',
  name: 'Front Door',
} as unknown as Camera;

const snapshot = {
  id: 'snap-1',
  cameraId: 'cam-1',
  capturedAt: new Date().toISOString(),
  kind: 'SUB',
  thumbUrl: 'https://signed.example/thumb.jpg',
  originalUrl: 'https://signed.example/original.jpg',
} as unknown as SnapshotItem;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockResult(over: Record<string, unknown>): any {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    ...over,
  };
}

// Shadow document.visibilityState on the instance and fire the Page Visibility
// event so useDocumentVisible re-renders the tile with the new state.
function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

beforeEach(() => {
  mockQuery.mockReset();
});

afterEach(() => {
  // Restore the default so the next test starts foregrounded.
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

describe('SnapshotTile', () => {
  it('requests the latest SUB snapshot for the camera', () => {
    mockQuery.mockReturnValue(mockResult({ isLoading: true }));
    render(<SnapshotTile camera={camera} onRemove={vi.fn()} />);
    expect(mockQuery).toHaveBeenCalledWith(
      { cameraId: 'cam-1', kind: 'SUB', limit: 1 },
      expect.objectContaining({ pollingInterval: expect.any(Number) })
    );
  });

  it('shows a loading state before the first snapshot resolves', () => {
    mockQuery.mockReturnValue(mockResult({ isLoading: true }));
    render(<SnapshotTile camera={camera} onRemove={vi.fn()} />);
    expect(screen.getByText(/loading screenshot/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders the latest stored screenshot with an accessible alt', () => {
    mockQuery.mockReturnValue(mockResult({ data: [snapshot] }));
    render(<SnapshotTile camera={camera} onRemove={vi.fn()} />);
    const img = screen.getByRole('img', { name: /latest screenshot from front door/i });
    expect(img).toHaveAttribute('src', snapshot.thumbUrl);
    expect(screen.getByText('Screenshot')).toBeInTheDocument();
  });

  it('captions the screenshot with the camera identity and an absolute capture time', () => {
    mockQuery.mockReturnValue(mockResult({ data: [snapshot] }));
    const { container } = render(<SnapshotTile camera={camera} onRemove={vi.fn()} />);
    // Identity lives once, in the bottom capture strip — not duplicated up top.
    expect(screen.getByText('CAM-001')).toBeInTheDocument();
    expect(screen.getByText(/front door/i)).toBeInTheDocument();
    // Capture time is an absolute instant anchored via a semantic <time>.
    const time = container.querySelector('time');
    expect(time).not.toBeNull();
    expect(time).toHaveAttribute('dateTime', snapshot.capturedAt);
  });

  it('treats an empty history as "no screenshot", not an error', () => {
    mockQuery.mockReturnValue(mockResult({ data: [] }));
    render(<SnapshotTile camera={camera} onRemove={vi.fn()} />);
    expect(screen.getByText(/no recent screenshot/i)).toBeInTheDocument();
  });

  it('shows an unavailable message when the query errors', () => {
    mockQuery.mockReturnValue(mockResult({ isError: true }));
    render(<SnapshotTile camera={camera} onRemove={vi.fn()} />);
    expect(screen.getByText(/screenshot unavailable/i)).toBeInTheDocument();
  });

  it('falls back gracefully when the (expired) image URL fails to load', () => {
    mockQuery.mockReturnValue(mockResult({ data: [snapshot] }));
    render(<SnapshotTile camera={camera} onRemove={vi.fn()} />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText(/screenshot unavailable/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('calls onRemove from the remove button', () => {
    const onRemove = vi.fn();
    mockQuery.mockReturnValue(mockResult({ data: [snapshot] }));
    render(<SnapshotTile camera={camera} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: /remove front door from wall/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('re-fetches the screenshot from the manual refresh button', () => {
    const refetch = vi.fn();
    mockQuery.mockReturnValue(mockResult({ data: [snapshot], refetch }));
    render(<SnapshotTile camera={camera} onRemove={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /refresh screenshot for front door/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('polls on the configured cadence while visible and pauses while the tab is hidden', () => {
    mockQuery.mockReturnValue(mockResult({ data: [snapshot] }));
    render(<SnapshotTile camera={camera} onRemove={vi.fn()} />);

    // Foreground (jsdom default) → active poll cadence.
    expect(mockQuery).toHaveBeenLastCalledWith(
      { cameraId: 'cam-1', kind: 'SUB', limit: 1 },
      { pollingInterval: SNAPSHOT_POLL_MS }
    );

    // Tab hidden → interval collapses to 0, pausing the poll.
    setVisibility('hidden');
    expect(mockQuery).toHaveBeenLastCalledWith(
      { cameraId: 'cam-1', kind: 'SUB', limit: 1 },
      { pollingInterval: 0 }
    );

    // Foreground again → cadence resumes.
    setVisibility('visible');
    expect(mockQuery).toHaveBeenLastCalledWith(
      { cameraId: 'cam-1', kind: 'SUB', limit: 1 },
      { pollingInterval: SNAPSHOT_POLL_MS }
    );
  });
});
