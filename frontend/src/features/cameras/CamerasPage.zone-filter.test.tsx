import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// vi.mock factories are hoisted above these declarations, so everything they
// reference must live in vi.hoisted() (otherwise: TDZ "cannot access before
// initialization"). This suite locks the "All sites" dropdown to the real,
// scope-filtered zone list (the same source that backs the sidebar) rather
// than the site list it used to render.
const h = vi.hoisted(() => {
  const cam = (id: string, name: string) => ({
    id,
    name,
    cameraCode: `CAM-${id}`,
    status: 'HEALTHY',
    healthScore: 100,
    maintenanceMode: false,
    site: { id: 's1', name: 'HQ' },
  });
  const zone = (id: string, name: string, cameraCount: number) => ({
    id,
    name,
    region: 'North',
    cameraCount,
    criticalCount: 0,
    warningCount: 0,
    maintenanceCount: 0,
    state: 'healthy',
  });
  return {
    role: 'PROJECT_ADMIN' as string,
    listCamerasSpy: vi.fn(),
    del: vi.fn(() => ({ unwrap: () => Promise.resolve() })),
    // The zones the scope-filtered backend returns. "Empty Zone" has zero
    // cameras but MUST still be offered — that is the whole point of the fix.
    // A caller-forbidden zone is simply never in this list (RBAC handled server
    // side), so it can never appear as an option.
    zones: [zone('z-north', 'North Wing', 2), zone('z-empty', 'Empty Zone', 0)] as unknown[],
    // What GET /cameras returns for each zoneId filter ('' == "All sites").
    camerasByZone: {
      '': [cam('a', 'Lobby Cam'), cam('b', 'Dock Cam')],
      'z-north': [cam('a', 'Lobby Cam'), cam('b', 'Dock Cam')],
      'z-empty': [],
    } as Record<string, ReturnType<typeof cam>[]>,
  };
});

vi.mock('./cameras.api', () => ({
  useListCamerasQuery: (params: { zoneId?: string; page?: number; limit?: number }) => {
    h.listCamerasSpy(params);
    const items = h.camerasByZone[params.zoneId ?? ''] ?? [];
    return {
      data: { items, total: items.length, page: params.page ?? 1, limit: params.limit ?? 24 },
      isLoading: false,
      isFetching: false,
      error: undefined,
      refetch: vi.fn(),
    };
  },
  // AddCameraModal (stubbed below) is the only remaining consumer of the site
  // list; the page itself must no longer call it.
  useListSitesLiteQuery: () => ({ data: { items: [], total: 0, page: 1, limit: 100 } }),
  useDeleteCameraMutation: () => [h.del, { isLoading: false }],
}));
vi.mock('@/features/auth/auth.api', () => ({
  useGetCurrentUserQuery: () => ({ data: { id: 'u1', role: h.role } }),
}));
vi.mock('@/features/overview/overview.api', () => ({
  useListZoneSummariesQuery: () => ({ data: h.zones }),
}));
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toasts: [], dismiss: vi.fn(), success: vi.fn(), error: vi.fn() }),
}));
// Stub heavy children so we test only page logic (avoids maplibre etc.).
vi.mock('./CameraMapView', () => ({ CameraMapView: () => <div data-testid="map" /> }));
vi.mock('./AddCameraModal', () => ({ AddCameraModal: () => null }));
vi.mock('./CameraDetailDrawer', () => ({ CameraDetailDrawer: () => null }));

import { CamerasPage } from './CamerasPage';

function renderPage(entry = '/cameras') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <CamerasPage />
    </MemoryRouter>
  );
}

const zoneSelect = (): HTMLElement =>
  screen.getByRole('combobox', { name: /filter by zone/i });

beforeEach(() => {
  vi.clearAllMocks();
  h.role = 'PROJECT_ADMIN';
});

describe('CamerasPage — zone filter dropdown', () => {
  it('offers every accessible zone (including one with no cameras), "All sites" first', () => {
    renderPage();
    const select = zoneSelect();
    const options = within(select).getAllByRole('option');

    // Default option stays first and keeps its "All sites" label.
    expect(options[0]).toHaveTextContent('All sites');
    expect(within(select).getByRole('option', { name: 'North Wing' })).toBeInTheDocument();
    // The empty zone is present in the sidebar list, so it must be selectable here too.
    expect(within(select).getByRole('option', { name: 'Empty Zone' })).toBeInTheDocument();
  });

  it('never offers a zone the scoped backend did not return (no cross-scope leak)', () => {
    renderPage();
    const select = zoneSelect();
    // Exactly the scope-filtered zones plus the "All sites" default — nothing more.
    expect(within(select).getAllByRole('option')).toHaveLength(h.zones.length + 1);
    expect(
      within(select).queryByRole('option', { name: /forbidden|other org/i })
    ).toBeNull();
  });

  it('filters the camera list by zoneId when a zone is picked', () => {
    renderPage();
    fireEvent.change(zoneSelect(), { target: { value: 'z-north' } });
    expect(h.listCamerasSpy).toHaveBeenCalledWith(
      expect.objectContaining({ zoneId: 'z-north' })
    );
  });

  it('shows a clear zone-specific empty state when the selected zone has no cameras', () => {
    renderPage();
    fireEvent.change(zoneSelect(), { target: { value: 'z-empty' } });
    expect(screen.getByText(/no cameras found in this zone/i)).toBeInTheDocument();
  });

  it('restores every accessible camera when "All sites" is reselected', () => {
    renderPage('/cameras?zone=z-north');
    // The deep-linked zone drives the dropdown value.
    expect((zoneSelect() as HTMLSelectElement).value).toBe('z-north');

    fireEvent.change(zoneSelect(), { target: { value: '' } });

    // Dropping the filter re-queries with no zoneId and brings back the full fleet.
    expect(h.listCamerasSpy).toHaveBeenCalledWith(
      expect.objectContaining({ zoneId: undefined })
    );
    expect(screen.getByText('Lobby Cam')).toBeInTheDocument();
    expect(screen.getByText('Dock Cam')).toBeInTheDocument();
  });
});
