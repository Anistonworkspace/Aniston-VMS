import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Film, Plus } from 'lucide-react';
import { Button, SkeletonTable, ToastContainer } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { Select } from '@/features/reports/Select';
import type { SelectOption } from '@/features/reports/Select';
import { useGetCurrentUserQuery } from '@/features/auth/auth.api';
import { isOperatorPlusRole } from '@/features/auth/auth.types';
import { useGetFleetHealthQuery } from '@/features/analytics/analytics.api';
import { timeAgo } from '@/features/overview/timeAgo';
import { getApiErrorMessage } from '@/lib/apiError';
import { useListClipsQuery } from './clips.api';
import { ClipStatusBadge } from './ClipStatusBadge';
import { NewClipModal } from './NewClipModal';
import { CLIP_RETENTION_DAYS } from './clips.types';
import type { ClipStatus } from './clips.types';

const STATUS_OPTIONS: SelectOption[] = [
  { value: '', label: 'All statuses' },
  { value: 'QUEUED', label: 'Queued' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'DONE', label: 'Done' },
  { value: 'FAILED', label: 'Failed' },
];

/** Clip statuses that mean the server is still working — drives polling. */
const ACTIVE_STATUSES: readonly ClipStatus[] = ['QUEUED', 'PROCESSING'];
const POLL_MS = 5000;

const WINDOW_FMT = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const TIME_FMT = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

function formatWindow(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const sameDay = start.toDateString() === end.toDateString();
  return `${WINDOW_FMT.format(start)} → ${sameDay ? TIME_FMT.format(end) : WINDOW_FMT.format(end)}`;
}

function durationMinutes(startAt: string, endAt: string): number {
  return Math.max(1, Math.round((Date.parse(endAt) - Date.parse(startAt)) / 60_000));
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function ClipsPage(): JSX.Element {
  const { toasts, dismiss, success, error: toastError } = useToast();
  const [cameraFilter, setCameraFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [pollingInterval, setPollingInterval] = useState(0);

  const { data: user } = useGetCurrentUserQuery();
  const canExport = isOperatorPlusRole(user?.role);

  // Reused read-only from analytics — flat scoped camera list with id, name
  // and cameraCode; feeds both the filter options and the row name lookup.
  const { data: fleet } = useGetFleetHealthQuery();
  const cameraById = useMemo(() => new Map((fleet ?? []).map((c) => [c.id, c])), [fleet]);
  const cameraOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: 'All cameras' },
      ...(fleet ?? []).map((c) => ({ value: c.id, label: `${c.name} (${c.cameraCode})` })),
    ],
    [fleet]
  );

  const {
    data: clips,
    isLoading,
    isError,
    error,
    refetch,
  } = useListClipsQuery(
    {
      cameraId: cameraFilter || undefined,
      status: (statusFilter || undefined) as ClipStatus | undefined,
    },
    { pollingInterval }
  );

  // Poll while any clip is QUEUED/PROCESSING so statuses and download links
  // appear without a manual refresh; stop as soon as everything is settled.
  useEffect(() => {
    const active = (clips ?? []).some((clip) => ACTIVE_STATUSES.includes(clip.status));
    setPollingInterval(active ? POLL_MS : 0);
  }, [clips]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-sora text-2xl font-semibold text-gray-900">Clips</h1>
          <p className="mt-1 text-sm text-gray-500">
            Export short clips from recorded footage. Downloads expire after {CLIP_RETENTION_DAYS}{' '}
            days.
          </p>
        </div>
        {canExport && (
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setModalOpen(true)}>
            New clip
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Select
            label="Camera"
            value={cameraFilter}
            onValueChange={setCameraFilter}
            options={cameraOptions}
            placeholder="All cameras"
          />
        </div>
        <div className="w-48">
          <Select
            label="Status"
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={STATUS_OPTIONS}
            placeholder="All statuses"
          />
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-white/30 bg-white/60 backdrop-blur-md shadow-glass">
        {isLoading && (
          <div className="p-4">
            <SkeletonTable rows={6} />
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-red-600">{getApiErrorMessage(error)}</p>
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        )}

        {!isLoading && !isError && (clips ?? []).length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Film className="h-8 w-8 text-gray-300" />
            <p className="text-sm font-medium text-gray-700">No clips yet</p>
            <p className="text-xs text-gray-500">
              {canExport
                ? 'Queue your first export with “New clip”.'
                : 'Operators can export clips from recorded footage.'}
            </p>
          </div>
        )}

        {!isLoading && !isError && (clips ?? []).length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3 font-medium">Camera</th>
                  <th className="px-4 py-3 font-medium">Window</th>
                  <th className="px-4 py-3 font-medium">Size</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Requested</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {(clips ?? []).map((clip) => {
                  const camera = cameraById.get(clip.cameraId);
                  return (
                    <tr
                      key={clip.id}
                      className="border-t border-gray-100/80 transition-colors hover:bg-white/50"
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">
                          {camera?.name ?? 'Unknown camera'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {camera?.cameraCode ?? clip.cameraId.slice(0, 8)}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <p className="text-sm text-gray-700">
                          {formatWindow(clip.startAt, clip.endAt)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {durationMinutes(clip.startAt, clip.endAt)} min
                        </p>
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-gray-700">
                        {formatBytes(clip.sizeBytes)}
                      </td>
                      <td className="px-4 py-3">
                        <ClipStatusBadge status={clip.status} />
                        {clip.status === 'FAILED' && clip.error && (
                          <p
                            className="mt-1 max-w-[16rem] truncate text-xs text-red-500"
                            title={clip.error}
                          >
                            {clip.error}
                          </p>
                        )}
                        {clip.incidentId && (
                          <Link
                            to={`/incidents/${clip.incidentId}`}
                            className="mt-1 block text-xs text-indigo-600 hover:underline"
                          >
                            View incident
                          </Link>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                        {timeAgo(clip.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {clip.status === 'DONE' && clip.downloadUrl ? (
                          <a
                            href={clip.downloadUrl}
                            download
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/40 bg-white/70 px-3.5 text-sm font-medium text-gray-800 shadow-glass backdrop-blur-sm transition-colors hover:bg-white/90"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewClipModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        cameras={fleet ?? []}
        notify={{ success, error: toastError }}
      />
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
