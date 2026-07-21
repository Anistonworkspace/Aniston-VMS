import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Cctv,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Map as MapIcon,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Button, Input, SkeletonCard, ToastContainer } from '@/components/ui';
import { useGetCurrentUserQuery } from '@/features/auth/auth.api';
import { isAdminRole, isCameraWriteRole } from '@/features/auth/auth.types';
import { useListZoneSummariesQuery } from '@/features/overview/overview.api';
import { useToast } from '@/hooks/useToast';
import { getApiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/utils';
import { listContainer, pageChild, pageTransition } from '@/lib/animations';
import { AddCameraModal } from './AddCameraModal';
import { CameraCard } from './CameraCard';
import { CameraDetailDrawer } from './CameraDetailDrawer';
import { CameraMapView } from './CameraMapView';
import { DeleteCameraModal } from './DeleteCameraModal';
import { useDeleteCameraMutation, useListCamerasQuery, useListSitesLiteQuery } from './cameras.api';
import type { Camera, CameraStatus } from './cameras.types';

const PAGE_SIZE = 24;

const DANGER_OUTLINE =
  'border-coral text-coral hover:bg-coral/10 hover:border-coral focus-visible:ring-coral';

const STATUS_FILTERS: Array<{ value: CameraStatus | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'HEALTHY', label: 'Healthy' },
  { value: 'WARNING', label: 'Warning' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

// Valid status values that may arrive via the "?status=" query param (e.g. from
// the dashboard KPI tiles that deep-link into a pre-filtered fleet grid).
const VALID_STATUSES = STATUS_FILTERS.map((filter) => filter.value).filter(
  Boolean
) as CameraStatus[];

function parseStatusParam(value: string | null): CameraStatus | '' {
  return value && (VALID_STATUSES as string[]).includes(value) ? (value as CameraStatus) : '';
}

// Cameras ("/cameras" + "/cameras/:cameraId") — filterable fleet grid backed by
// GET /cameras; the :cameraId segment opens the health drawer over the grid.
export function CamerasPage(): JSX.Element {
  const navigate = useNavigate();
  const { cameraId } = useParams<{ cameraId: string }>();
  const { toasts, dismiss, success, error: notifyError } = useToast();

  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  // Status is URL-derived so dashboard KPI tiles can deep-link into a filtered
  // grid (e.g. "/cameras?status=CRITICAL") and in-page changes stay shareable.
  const status = parseStatusParam(searchParams.get('status'));
  // Zone is URL-derived too so dashboard zone cards can deep-link into a
  // zone-filtered fleet ("/cameras?zone=<id>") and the filter stays shareable.
  const zoneId = searchParams.get('zone') ?? '';
  const [siteId, setSiteId] = useState('');
  const [page, setPage] = useState(1);

  // CR-6 — grid/map presentation toggle + role-gated registration modal.
  const [view, setView] = useState<'grid' | 'map'>('grid');
  const [addOpen, setAddOpen] = useState(false);

  const { data: user } = useGetCurrentUserQuery();
  const canRegister = isCameraWriteRole(user?.role);
  const canDelete = isAdminRole(user?.role); // mirrors backend ADMIN_ROLES (server still enforces)
  const [selecting, setSelecting] = useState(false);
  const [prevView, setPrevView] = useState<'grid' | 'map' | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Camera | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [del, { isLoading: isDeleting }] = useDeleteCameraMutation();

  const setStatus = (next: CameraStatus | ''): void => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) {
          params.set('status', next);
        } else {
          params.delete('status');
        }
        return params;
      },
      { replace: true }
    );
  };

  // Clearing the zone chip drops "?zone=" from the URL; other filters are kept.
  const clearZone = (): void => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete('zone');
        return params;
      },
      { replace: true }
    );
  };

  // Reset to the first page whenever the active status or zone filter changes,
  // including when driven externally by a dashboard deep-link rather than a click.
  useEffect(() => {
    setPage(1);
  }, [status, zoneId]);

  // Debounce free-text search so we don't hit GET /cameras on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const query = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      q: q || undefined,
      siteId: siteId || undefined,
      zoneId: zoneId || undefined,
      status: status || undefined,
    }),
    [page, q, siteId, zoneId, status]
  );

  const { data, isLoading, isFetching, error, refetch } = useListCamerasQuery(query);
  const { data: sites } = useListSitesLiteQuery();

  // Resolve the active zone's name for the filter chip. The list is already
  // scoped to the caller, so an out-of-scope "?zone=" simply yields no name
  // (and the backend returns zero cameras — never a cross-scope leak).
  const { data: zones } = useListZoneSummariesQuery();
  const activeZoneName = useMemo(
    () => (zoneId ? (zones?.find((zone) => zone.id === zoneId)?.name ?? null) : null),
    [zones, zoneId]
  );

  // The map ignores pagination — it plots the whole filtered fleet (capped at
  // 200 pins) so every site cluster is visible at once.
  const { data: mapData } = useListCamerasQuery(
    { ...query, page: 1, limit: 200 },
    { skip: view !== 'map' }
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  function enterSelection() {
    if (view === 'map') {
      setPrevView('map'); // selection is grid-only (needs the cards); remember to restore Map after
      setView('grid');
    }
    setSelecting(true);
  }

  function exitSelection() {
    setSelecting(false);
    setPendingDelete(null);
    setErrorMessage(null);
    if (prevView) {
      setView(prevView);
      setPrevView(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setErrorMessage(null);
    try {
      await del(pendingDelete.id).unwrap();
      success('Camera removed');
      exitSelection(); // closes modal, exits selection, restores previous view; tags refetch the list
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err)); // immediate, from the caught error → modal stays open, camera stays
    }
  }

  return (
    <motion.div variants={pageTransition} initial="hidden" animate="visible" className="space-y-6">
      <motion.header
        variants={pageChild}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <h1 className="font-heading text-2xl font-semibold text-ink">Cameras</h1>
          <p className="mt-1 text-sm text-tertiary">
            {data
              ? `${data.total} camera${data.total === 1 ? '' : 's'} in your scope`
              : 'Fleet health at a glance'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            leftIcon={<RefreshCw size={14} className={cn(isFetching && 'animate-spin')} />}
          >
            Refresh
          </Button>
          {canRegister && (
            <Button size="sm" onClick={() => setAddOpen(true)} leftIcon={<Plus size={14} />}>
              Add camera
            </Button>
          )}
          {canDelete &&
            (selecting ? (
              <Button variant="secondary" size="sm" onClick={exitSelection}>
                Cancel
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className={DANGER_OUTLINE}
                onClick={enterSelection}
                leftIcon={<Trash2 size={14} />}
              >
                Delete camera
              </Button>
            ))}
        </div>
      </motion.header>

      <motion.div variants={pageChild} className="flex flex-wrap items-center gap-3">
        <div className="w-full max-w-xs">
          <Input
            placeholder="Search name or code…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            leftAddon={<Search size={15} />}
            aria-label="Search cameras"
          />
        </div>
        <select
          value={siteId}
          onChange={(event) => {
            setSiteId(event.target.value);
            setPage(1);
          }}
          aria-label="Filter by site"
          className="h-9 rounded-lg border border-hairline bg-card px-3 text-sm text-ink transition-colors hover:border-hairline focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All sites</option>
          {(sites?.items ?? []).map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
        {zoneId && (
          <button
            type="button"
            onClick={clearZone}
            aria-label="Clear zone filter"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-sage/15 px-3 text-xs font-medium text-sage transition-colors hover:bg-sage/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          >
            <span className="truncate max-w-[12rem]">
              Zone: {activeZoneName ?? 'selected'}
            </span>
            <X size={13} />
          </button>
        )}
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Filter by status"
        >
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.label}
              type="button"
              aria-pressed={status === filter.value}
              onClick={() => setStatus(filter.value)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage',
                status === filter.value
                  ? 'bg-ink text-white'
                  : 'bg-card text-tertiary shadow-soft hover:text-ink'
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div
          className="ml-auto flex items-center gap-1 rounded-full bg-card p-1 shadow-soft"
          role="group"
          aria-label="Toggle grid or map view"
        >
          {(
            [
              { value: 'grid', label: 'Grid', icon: <LayoutGrid size={13} /> },
              { value: 'map', label: 'Map', icon: <MapIcon size={13} /> },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={view === option.value}
              onClick={() => setView(option.value)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage',
                view === option.value ? 'bg-ink text-white' : 'text-tertiary hover:text-ink'
              )}
            >
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>
      </motion.div>

      {selecting && (
        <motion.div
          variants={pageChild}
          className="rounded-card border border-hairline bg-card px-4 py-2.5 text-sm text-secondary shadow-soft"
          role="status"
        >
          Select a camera to delete.
        </motion.div>
      )}

      {view === 'map' ? (
        <motion.div variants={pageChild}>
          <CameraMapView
            cameras={mapData?.items ?? data?.items ?? []}
            onOpen={(id) => navigate(`/cameras/${id}`)}
          />
        </motion.div>
      ) : error ? (
        <motion.div
          variants={pageChild}
          className="rounded-card bg-card p-10 text-center shadow-soft"
        >
          <p className="text-sm text-tertiary">{getApiErrorMessage(error)}</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => refetch()}>
            Try again
          </Button>
        </motion.div>
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <motion.div
          key={`${page}-${q}-${siteId}-${zoneId}-${status}`}
          variants={listContainer}
          initial="hidden"
          animate="visible"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {data.items.map((camera) => (
            <CameraCard
              key={camera.id}
              camera={camera}
              onOpen={(id) => navigate(`/cameras/${id}`)}
              selectable={selecting}
              onSelect={(cam) => {
                setErrorMessage(null);
                setPendingDelete(cam);
              }}
            />
          ))}
        </motion.div>
      ) : (
        <motion.div
          variants={pageChild}
          className="rounded-card bg-card p-10 text-center shadow-soft"
        >
          <Cctv size={28} strokeWidth={1.5} className="mx-auto text-muted" />
          <p className="mt-3 text-sm font-medium text-ink">No cameras match these filters</p>
          <p className="mt-1 text-xs text-tertiary">
            Try clearing the search or switching the site/status filters.
          </p>
        </motion.div>
      )}

      {view === 'grid' && data && totalPages > 1 && (
        <motion.footer variants={pageChild} className="flex items-center justify-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            leftIcon={<ChevronLeft size={14} />}
          >
            Prev
          </Button>
          <span className="text-xs tabular-nums text-tertiary">
            Page {data.page} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            rightIcon={<ChevronRight size={14} />}
          >
            Next
          </Button>
        </motion.footer>
      )}

      <CameraDetailDrawer
        cameraId={cameraId ?? null}
        onClose={() => navigate('/cameras')}
        notify={{ success, error: notifyError }}
      />

      <AddCameraModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        notify={{ success, error: notifyError }}
      />

      <DeleteCameraModal
        open={pendingDelete !== null}
        camera={pendingDelete}
        loading={isDeleting}
        errorMessage={errorMessage}
        onConfirm={confirmDelete}
        onCancel={() => {
          setPendingDelete(null); // cancel the popup but stay in selection mode to pick another
          setErrorMessage(null);
        }}
      />

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </motion.div>
  );
}
