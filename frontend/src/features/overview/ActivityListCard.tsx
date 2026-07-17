import {
  AlertTriangle,
  ChevronDown,
  ImageOff,
  Signal,
  VideoOff,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AvatarStack, Skeleton } from '@/components/ui';
import type { IncidentKind, IncidentSeverity, IncidentSummary } from '@/types/vms';
import { timeAgo } from './timeAgo';

// "Recent incidents" list card — docs/04-uiux-brief.md §7 Row 2 (reference
// Last File): severity-tinted icon tile · title · sub · avatar stack · age.
const KIND_ICONS: Record<IncidentKind, LucideIcon> = {
  STREAM: VideoOff,
  OFFLINE: AlertTriangle,
  IMAGE: ImageOff,
  SIGNAL: Signal,
  MAINTENANCE: Wrench,
};

const SEVERITY_TILE: Record<IncidentSeverity, string> = {
  CRITICAL: 'bg-state-critical-soft text-state-critical',
  WARNING: 'bg-state-warning-soft text-state-warning',
  MAINTENANCE: 'bg-state-maintenance-soft text-state-maintenance',
};

interface ActivityListCardProps {
  incidents?: IncidentSummary[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function ActivityListCard({
  incidents,
  isLoading,
  isError,
  onRetry,
}: ActivityListCardProps): JSX.Element {
  return (
    <section className="flex h-full flex-col rounded-card bg-card p-6 shadow-soft" aria-label="Recent incidents">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold text-ink">Recent incidents</h2>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-control border border-hairline px-3 py-1.5 text-sm text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
        >
          Last 24 h
          <ChevronDown size={16} strokeWidth={1.5} />
        </button>
      </div>
      <div className="mt-4 border-t border-hairline" aria-hidden />

      {isLoading ? (
        <div className="mt-4 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 px-2 py-2">
              <Skeleton width={40} height={40} className="rounded-tile" />
              <div className="flex-1 space-y-1.5">
                <Skeleton variant="line" width="55%" />
                <Skeleton variant="line" width="40%" height={10} />
              </div>
              <Skeleton variant="line" width={56} height={10} />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="py-10 text-center">
          <p className="text-sm text-muted">Couldn&apos;t load incidents.</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-control bg-sage px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-sage-hover"
          >
            Retry
          </button>
        </div>
      ) : !incidents || incidents.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">
          All clear — no incidents in the last 24 h.
        </p>
      ) : (
        <ul className="mt-2">
          {incidents.map((incident) => {
            const KindIcon = KIND_ICONS[incident.kind];
            return (
              <li key={incident.id}>
                <button
                  type="button"
                  aria-label={`Open incident ${incident.code}`}
                  className="flex w-full items-center gap-4 rounded-tile px-2 py-3 text-left transition-colors duration-150 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                >
                  <span
                    className={cn(
                      'grid h-10 w-10 shrink-0 place-items-center rounded-tile',
                      SEVERITY_TILE[incident.severity]
                    )}
                  >
                    <KindIcon size={18} strokeWidth={1.5} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {incident.cameraLabel} · {incident.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {incident.siteName} · {incident.code}
                    </span>
                  </span>
                  <AvatarStack
                    names={incident.assignees}
                    overflow={incident.notifiedOverflow}
                    className="hidden shrink-0 sm:flex"
                  />
                  <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted">
                    {timeAgo(incident.occurredAt)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
