import { useEffect, useState } from 'react';
import { Search, Video, ChevronDown } from 'lucide-react';
import { AnimatedPopover, Badge, Input, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/apiError';
import { useListCamerasForPlaybackQuery } from './cameras-lite.api';
import type { CameraLite, CameraStatus } from './playback.types';

const STATUS_BADGE: Record<
  CameraStatus,
  { variant: 'success' | 'warning' | 'danger' | 'purple' | 'default'; label: string }
> = {
  HEALTHY: { variant: 'success', label: 'Healthy' },
  WARNING: { variant: 'warning', label: 'Warning' },
  CRITICAL: { variant: 'danger', label: 'Critical' },
  MAINTENANCE: { variant: 'purple', label: 'Maintenance' },
  UNKNOWN: { variant: 'default', label: 'Unknown' },
};

interface CameraPickerProps {
  value: CameraLite | null;
  onChange: (camera: CameraLite) => void;
}

/** Searchable camera selector — local to the Playback feature (see cameras-lite.api.ts). */
export function CameraPicker({ value, onChange }: CameraPickerProps) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isFetching, isError, error } = useListCamerasForPlaybackQuery({
    page: 1,
    limit: 50,
    q: debounced || undefined,
  });

  return (
    <AnimatedPopover
      placement="bottom-start"
      className="w-80 p-2"
      trigger={
        <button
          type="button"
          className={cn(
            'inline-flex h-9 min-w-[220px] items-center justify-between gap-2 rounded-lg border border-hairline',
            'bg-card px-3.5 text-sm text-ink shadow-sm hover:border-hairline'
          )}
        >
          <span className="inline-flex items-center gap-2 truncate">
            <Video className="h-4 w-4 text-muted" />
            {value ? (
              <span className="truncate">
                <span className="font-medium">{value.cameraCode}</span>
                <span className="ml-1.5 text-muted">{value.name}</span>
              </span>
            ) : (
              <span className="text-muted">Select a camera…</span>
            )}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
        </button>
      }
    >
      <div className="space-y-2">
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or code…"
          leftAddon={<Search className="h-4 w-4" />}
        />
        <div className="max-h-72 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2 p-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} height={36} className="rounded-lg" />
              ))}
            </div>
          ) : isError ? (
            <p className="px-2 py-3 text-sm text-coral">{getApiErrorMessage(error)}</p>
          ) : data && data.items.length > 0 ? (
            <ul className="space-y-0.5">
              {data.items.map((camera) => {
                const badge = STATUS_BADGE[camera.status];
                const selected = value?.id === camera.id;
                return (
                  <li key={camera.id}>
                    <button
                      type="button"
                      onClick={() => onChange(camera)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                        selected
                          ? 'bg-sage-soft text-sage'
                          : 'hover:bg-surface text-ink'
                      )}
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{camera.cameraCode}</span>
                        <span className="ml-1.5 text-muted">{camera.name}</span>
                      </span>
                      <Badge variant={badge.variant} size="sm" className="shrink-0">
                        {badge.label}
                      </Badge>
                    </button>
                  </li>
                );
              })}
              {isFetching && <li className="px-2.5 py-1 text-xs text-muted">Refreshing…</li>}
            </ul>
          ) : (
            <p className="px-2 py-3 text-sm text-muted">No cameras match “{debounced}”.</p>
          )}
        </div>
      </div>
    </AnimatedPopover>
  );
}
