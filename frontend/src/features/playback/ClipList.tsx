import { useEffect, useState } from 'react';
import { AlertTriangle, Download, FileVideo, Loader2 } from 'lucide-react';
import { Badge, Skeleton, Tooltip } from '@/components/ui';
import { getApiErrorMessage } from '@/lib/apiError';
import { useListClipExportsQuery } from './clips.api';
import type { ClipExport, ClipStatus } from './playback.types';

const STATUS_BADGE: Record<
  ClipStatus,
  { variant: 'default' | 'warning' | 'success' | 'danger'; label: string }
> = {
  QUEUED: { variant: 'default', label: 'Queued' },
  PROCESSING: { variant: 'warning', label: 'Processing' },
  DONE: { variant: 'success', label: 'Ready' },
  FAILED: { variant: 'danger', label: 'Failed' },
};

const ACTIVE_STATUSES: ClipStatus[] = ['QUEUED', 'PROCESSING'];
const POLL_MS = 4_000;

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes;
  let i = -1;
  do {
    value /= 1024;
    i += 1;
  } while (value >= 1024 && i < units.length - 1);
  return `${value.toFixed(1)} ${units[i]}`;
}

interface ClipListProps {
  cameraId: string;
}

/** Polls GET /clips for this camera while any export is QUEUED/PROCESSING; stops once all are terminal. */
export function ClipList({ cameraId }: ClipListProps) {
  const [pollingInterval, setPollingInterval] = useState(POLL_MS);

  const { data, isLoading, isError, error } = useListClipExportsQuery(
    { cameraId, limit: 20 },
    { pollingInterval }
  );

  useEffect(() => {
    if (!data) return;
    const hasActive = data.some((c) => ACTIVE_STATUSES.includes(c.status));
    setPollingInterval(hasActive ? POLL_MS : 0);
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} height={52} className="rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-state-critical/30 bg-state-critical-soft px-4 py-6 text-center text-sm text-state-critical">
        {getApiErrorMessage(error)}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-hairline bg-surface px-4 py-8 text-center text-sm text-muted">
        <FileVideo className="h-6 w-6" />
        No clips yet — select a range on the timeline above and request an export.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {data.map((clip: ClipExport) => {
        const badge = STATUS_BADGE[clip.status];
        return (
          <li
            key={clip.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-card px-4 py-3"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="truncate text-sm font-medium text-ink">
                {new Date(clip.startAt).toLocaleString()} →{' '}
                {new Date(clip.endAt).toLocaleTimeString()}
              </p>
              <p className="text-xs text-muted">
                {formatBytes(clip.sizeBytes)} · requested{' '}
                {new Date(clip.createdAt).toLocaleString()}
                {clip.incidentId && ` · incident ${clip.incidentId.slice(0, 8)}`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {clip.status === 'FAILED' && clip.error ? (
                <Tooltip content={clip.error}>
                  <Badge variant={badge.variant} size="sm">
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    {badge.label}
                  </Badge>
                </Tooltip>
              ) : (
                <Badge variant={badge.variant} size="sm">
                  {clip.status === 'PROCESSING' && (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  )}
                  {badge.label}
                </Badge>
              )}
              {clip.status === 'DONE' && clip.downloadUrl && (
                <a
                  href={clip.downloadUrl}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairline bg-card px-3 text-xs font-medium text-ink shadow-sm hover:border-hairline"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
