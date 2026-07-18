import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Cctv, ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { Button, Input, SkeletonCard, ToastContainer } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { getApiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/utils';
import { listContainer, pageChild, pageTransition } from '@/lib/animations';
import { CameraCard } from './CameraCard';
import { CameraDetailDrawer } from './CameraDetailDrawer';
import { useListCamerasQuery, useListSitesLiteQuery } from './cameras.api';
import type { CameraStatus } from './cameras.types';

const PAGE_SIZE = 24;

const STATUS_FILTERS: Array<{ value: CameraStatus | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'HEALTHY', label: 'Healthy' },
  { value: 'WARNING', label: 'Warning' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

// Cameras ("/cameras" + "/cameras/:cameraId") — filterable fleet grid backed by
// GET /cameras; the :cameraId segment opens the health drawer over the grid.
export function CamerasPage(): JSX.Element {
  const navigate = useNavigate();
  const { cameraId } = useParams<{ cameraId: string }>();
  const { toasts, dismiss, success, error: notifyError } = useToast();

  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<CameraStatus | ''>('');
  const [siteId, setSiteId] = useState('');
  const [page, setPage] = useState(1);

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
      status: status || undefined,
    }),
    [page, q, siteId, status]
  );

  const { data, isLoading, isFetching, error, refetch } = useListCamerasQuery(query);
  const { data: sites } = useListSitesLiteQuery();

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <motion.div variants={pageTransition} initial="hidden" animate="visible" className="space-y-6">
      <motion.header
        variants={pageChild}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <h1 className="font-heading text-2xl font-semibold text-ink">Cameras</h1>
          <p className="mt-1 text-sm text-gray-500">
            {data
              ? `${data.total} camera${data.total === 1 ? '' : 's'} in your scope`
              : 'Fleet health at a glance'}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => refetch()}
          leftIcon={<RefreshCw size={14} className={cn(isFetching && 'animate-spin')} />}
        >
          Refresh
        </Button>
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
          className="h-9 rounded-lg border border-gray-200 bg-white/70 px-3 text-sm text-gray-900 backdrop-blur-sm transition-colors hover:border-gray-300 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All sites</option>
          {(sites?.items ?? []).map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Filter by status"
        >
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.label}
              type="button"
              onClick={() => {
                setStatus(filter.value);
                setPage(1);
              }}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage',
                status === filter.value
                  ? 'bg-ink text-white'
                  : 'bg-card text-gray-600 shadow-soft hover:text-ink'
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </motion.div>

      {error ? (
        <motion.div
          variants={pageChild}
          className="rounded-card bg-card p-10 text-center shadow-soft"
        >
          <p className="text-sm text-gray-600">{getApiErrorMessage(error)}</p>
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
          key={`${page}-${q}-${siteId}-${status}`}
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
            />
          ))}
        </motion.div>
      ) : (
        <motion.div
          variants={pageChild}
          className="rounded-card bg-card p-10 text-center shadow-soft"
        >
          <Cctv size={28} strokeWidth={1.5} className="mx-auto text-gray-400" />
          <p className="mt-3 text-sm font-medium text-ink">No cameras match these filters</p>
          <p className="mt-1 text-xs text-gray-500">
            Try clearing the search or switching the site/status filters.
          </p>
        </motion.div>
      )}

      {data && totalPages > 1 && (
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
          <span className="text-xs tabular-nums text-gray-500">
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

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </motion.div>
  );
}
