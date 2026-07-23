import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { formatDateTime } from '@/lib/utils';
import type { CameraHealthDetail, SnapshotItem } from './cameras.types';
import { CameraDetailDrawer } from './CameraDetailDrawer';

vi.mock('@/features/auth/auth.api', () => ({
  useGetCurrentUserQuery: vi.fn(),
}));

vi.mock('./cameras.api', () => ({
  useGetCameraHealthQuery: vi.fn(),
  useListCameraChecksQuery: vi.fn(),
  useListCameraSnapshotsQuery: vi.fn(),
  useRunCameraCheckMutation: vi.fn(),
  useUpdateCameraMutation: vi.fn(),
  useCaptureSnapshotMutation: vi.fn(),
}));

import { useGetCurrentUserQuery } from '@/features/auth/auth.api';
import {
  useCaptureSnapshotMutation,
  useGetCameraHealthQuery,
  useListCameraChecksQuery,
  useListCameraSnapshotsQuery,
  useRunCameraCheckMutation,
  useUpdateCameraMutation,
} from './cameras.api';

const health = {
  id: 'cam-1',
  cameraCode: 'CAM-001',
  name: 'Front Door',
  latitude: 28.600148,
  longitude: 77.19458,
  status: 'ONLINE',
  healthScore: 98,
  diagnosis: null,
  diagnosisText: null,
  lastHealthyAt: '2026-02-05T09:40:00.000Z',
  maintenanceMode: false,
  expectedCodec: 'H.264',
  expectedResolution: '1920x1080',
  expectedFps: 25,
  expectedBitrateKbps: 4096,
  site: { id: 'site-1', name: 'HQ' },
  router: null,
  pipeline: [],
} as unknown as CameraHealthDetail;

const snapshot = {
  id: 'snap-1',
  cameraId: 'cam-1',
  capturedAt: '2026-02-05T09:42:00.000Z',
  kind: 'SUB',
  thumbUrl: 'https://signed.example/thumb.jpg',
  originalUrl: 'https://signed.example/original.jpg',
} as unknown as SnapshotItem;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function queryResult(over: Record<string, unknown> = {}): any {
  return { data: undefined, isLoading: false, error: undefined, refetch: vi.fn(), ...over };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mutationResult = (): any => [vi.fn(), { isLoading: false }];

const notify = { success: vi.fn(), error: vi.fn() };

beforeEach(() => {
  vi.mocked(useGetCurrentUserQuery).mockReturnValue(queryResult({ data: { role: 'VIEWER' } }));
  vi.mocked(useGetCameraHealthQuery).mockReturnValue(queryResult({ data: health }));
  vi.mocked(useListCameraChecksQuery).mockReturnValue(queryResult({ data: [] }));
  vi.mocked(useListCameraSnapshotsQuery).mockReturnValue(queryResult({ data: [snapshot] }));
  vi.mocked(useRunCameraCheckMutation).mockReturnValue(mutationResult());
  vi.mocked(useUpdateCameraMutation).mockReturnValue(mutationResult());
  vi.mocked(useCaptureSnapshotMutation).mockReturnValue(mutationResult());
});

function renderDrawer() {
  return render(<CameraDetailDrawer cameraId="cam-1" onClose={vi.fn()} notify={notify} />);
}

describe('CameraDetailDrawer', () => {
  it('shows the camera coordinates in the Device section', () => {
    renderDrawer();
    expect(screen.getByText('Coordinates')).toBeInTheDocument();
    expect(screen.getByText('28.6001° N, 77.1946° E')).toBeInTheDocument();
  });

  it('captions recent snapshots with an absolute capture time, not a relative one', () => {
    const { container } = renderDrawer();
    const time = container.querySelector('time');
    expect(time).not.toBeNull();
    expect(time).toHaveAttribute('dateTime', snapshot.capturedAt);
    expect(time).toHaveTextContent(formatDateTime(snapshot.capturedAt));
  });
});
