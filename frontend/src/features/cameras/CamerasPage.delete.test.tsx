import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// vi.mock factories are hoisted above these declarations, so anything they
// reference must live in vi.hoisted() (otherwise: TDZ "cannot access before
// initialization"). Keep del/successToast/role here so the factories can use them.
const h = vi.hoisted(() => ({
  del: vi.fn(() => ({ unwrap: () => Promise.resolve() })),
  successToast: vi.fn(),
  role: 'PROJECT_ADMIN' as string,
}));

const cameras = [
  { id: 'cam-1', name: 'Front Door', cameraCode: 'CAM-001', status: 'HEALTHY', healthScore: 90, maintenanceMode: false, site: { id: 's1', name: 'HQ' } },
  { id: 'cam-2', name: 'Lobby', cameraCode: 'CAM-002', status: 'WARNING', healthScore: 60, maintenanceMode: false, site: { id: 's1', name: 'HQ' } },
];

vi.mock('./cameras.api', () => ({
  useListCamerasQuery: () => ({
    data: { items: cameras, total: cameras.length, page: 1, limit: 24 },
    isLoading: false,
    isFetching: false,
    error: undefined,
    refetch: vi.fn(),
  }),
  useListSitesLiteQuery: () => ({ data: { items: [], total: 0, page: 1, limit: 100 } }),
  useDeleteCameraMutation: () => [h.del, { isLoading: false }],
}));
vi.mock('@/features/auth/auth.api', () => ({
  useGetCurrentUserQuery: () => ({ data: { id: 'u1', role: h.role } }),
}));
vi.mock('@/features/overview/overview.api', () => ({
  useListZoneSummariesQuery: () => ({ data: undefined }),
}));
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toasts: [], dismiss: vi.fn(), success: h.successToast, error: vi.fn() }),
}));
// Stub heavy children so we test only page logic (avoids maplibre etc.).
vi.mock('./CameraMapView', () => ({ CameraMapView: () => <div data-testid="map" /> }));
vi.mock('./AddCameraModal', () => ({ AddCameraModal: () => null }));
vi.mock('./CameraDetailDrawer', () => ({ CameraDetailDrawer: () => null }));

import { CamerasPage } from './CamerasPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/cameras']}>
      <CamerasPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.role = 'PROJECT_ADMIN';
  // clearAllMocks wipes call history but not the base impl; restore a clean
  // resolving default so a prior mockReturnValueOnce can't leak between tests.
  h.del.mockReturnValue({ unwrap: () => Promise.resolve() });
});

describe('CamerasPage — delete', () => {
  it('renders action buttons in order Refresh → Add camera → Delete camera', () => {
    renderPage();
    const labels = screen
      .getAllByRole('button')
      .map((b) => b.textContent?.trim())
      .filter((t) => t === 'Refresh' || t === 'Add camera' || t === 'Delete camera');
    expect(labels.slice(0, 3)).toEqual(['Refresh', 'Add camera', 'Delete camera']);
  });

  it('hides Delete camera for non-admins', () => {
    h.role = 'OPERATOR';
    renderPage();
    expect(screen.queryByRole('button', { name: /delete camera/i })).not.toBeInTheDocument();
  });

  it('Delete camera opens the intro modal without entering selection mode yet', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /delete camera/i }));
    // Intro prompt is shown…
    expect(screen.getByText('Choose the camera you want to remove.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
    // …but selection mode is NOT active yet: no banner, cards are not selectable.
    expect(screen.queryByText('Select a camera to delete.')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /select front door to delete/i })
    ).not.toBeInTheDocument();
  });

  it('Cancel on the intro modal closes it without entering selection mode', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /delete camera/i }));
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() =>
      expect(screen.queryByText('Choose the camera you want to remove.')).not.toBeInTheDocument()
    );
    // Still not selecting: Delete camera remains, no selectable cards.
    expect(screen.getByRole('button', { name: /delete camera/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /select front door to delete/i })
    ).not.toBeInTheDocument();
  });

  it('Continue enters selection mode (no banner), then a card click opens the modal (no navigate)', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /delete camera/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    // Intro modal closes; wait for it to unmount before asserting the page state.
    await waitFor(() =>
      expect(screen.queryByText('Choose the camera you want to remove.')).not.toBeInTheDocument()
    );
    // The old inline banner must never appear.
    expect(screen.queryByText('Select a camera to delete.')).not.toBeInTheDocument();
    // Header now offers Cancel and the cards are selectable.
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /select front door to delete/i }));
    expect(screen.getByText(/are you sure you want to remove this camera/i)).toBeInTheDocument();
  });

  it('confirms a delete → mutation called, success toast, modal closes', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /delete camera/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    // Wait for the intro modal to unmount so only the delete dialog is queried below.
    await waitFor(() =>
      expect(screen.queryByText('Choose the camera you want to remove.')).not.toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /select front door to delete/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^delete camera$/i }));
    expect(h.del).toHaveBeenCalledWith('cam-1');
    // success toast fires after the delete promise resolves (a microtask).
    await waitFor(() => expect(h.successToast).toHaveBeenCalledWith('Camera removed'));
    // AnimatePresence exit can linger a tick under jsdom — wait for the unmount.
    await waitFor(() =>
      expect(screen.queryByText(/are you sure you want to remove/i)).not.toBeInTheDocument()
    );
  });

  it('on failure keeps the modal open, shows the error, and leaves the camera in the list', async () => {
    h.del.mockReturnValueOnce({
      unwrap: () => Promise.reject({ status: 409, data: { error: { code: 'CONFLICT', message: 'still has recorded history' } } }),
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /delete camera/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    // Wait for the intro modal to unmount so only the delete dialog is queried below.
    await waitFor(() =>
      expect(screen.queryByText('Choose the camera you want to remove.')).not.toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /select front door to delete/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^delete camera$/i }));
    expect(await screen.findByText(/still has recorded history/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // The camera card is still present in the grid (its selection button remains),
    // proving the failed delete left the list untouched. (Note: the name also
    // appears inside the open modal, so scope to the card's selection control.)
    expect(
      screen.getByRole('button', { name: /select front door to delete/i })
    ).toBeInTheDocument();
  });
});
