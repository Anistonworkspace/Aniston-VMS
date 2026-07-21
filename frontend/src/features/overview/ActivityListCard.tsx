import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ImageOff,
  Signal,
  VideoOff,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { scalePopDown } from '@/lib/animations';
import { cn } from '@/lib/utils';
import { AvatarStack, Skeleton } from '@/components/ui';
import { prettyEnum } from '@/lib/prettyEnum';
import type { IncidentListItem, IncidentSeverity } from '@/features/incidents/incidents.types';
import { timeAgo } from './timeAgo';
import { INCIDENT_RANGES, rangeLabel, type IncidentRange } from './incidentRange';

// "Recent incidents" list card — docs/04-uiux-brief.md §7 Row 2 (reference
// Last File): severity-tinted icon tile · title · sub · avatar stack · age.

// Icon by diagnosis family — mirrors the backend INCIDENT_KIND_BY_TYPE collapse
// (dashboard.widgets.ts) so an unknown/new type still renders a sane glyph.
function iconForType(type: string): LucideIcon {
  const t = type.toUpperCase();
  if (t.includes('STREAM')) return VideoOff;
  if (t.includes('IMAGE') || t.includes('WATERLOG')) return ImageOff;
  if (t.includes('SIGNAL') || t.includes('SIM') || t.includes('NETWORK') || t.includes('INTERNET'))
    return Signal;
  if (t.includes('CONFIG') || t.includes('MAINTEN')) return Wrench;
  return AlertTriangle;
}

// Real 3-tier incident severity (INFO | WARNING | CRITICAL) → existing state
// tokens only (INFO reuses the maintenance/info tint — no new colours).
const SEVERITY_TILE: Record<IncidentSeverity, string> = {
  CRITICAL: 'bg-state-critical-soft text-state-critical',
  WARNING: 'bg-state-warning-soft text-state-warning',
  INFO: 'bg-state-maintenance-soft text-state-maintenance',
};

interface ActivityListCardProps {
  incidents?: IncidentListItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  range: IncidentRange;
  onRangeChange: (range: IncidentRange) => void;
  onSelect: (incidentId: string) => void;
}

/** Self-contained accessible time-range menu (closes on select · outside-click · Escape). */
function RangeMenu({
  range,
  onRangeChange,
}: {
  range: IncidentRange;
  onRangeChange: (range: IncidentRange) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent): void {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Change time range"
        className="flex items-center gap-1.5 rounded-control border border-hairline px-3 py-1.5 text-sm text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
      >
        {rangeLabel(range)}
        <ChevronDown
          size={16}
          strokeWidth={1.5}
          className={cn('transition-transform duration-150', open && 'rotate-180')}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            key="range-menu"
            variants={scalePopDown}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="menu"
            aria-label="Time range"
            className="absolute right-0 top-full z-20 mt-2 min-w-[10rem] overflow-hidden rounded-xl border border-hairline bg-card p-1 shadow-soft"
          >
            {INCIDENT_RANGES.map((option) => (
              <li key={option.value} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={option.value === range}
                  onClick={() => {
                    onRangeChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage',
                    option.value === range
                      ? 'bg-surface font-medium text-ink'
                      : 'text-muted hover:bg-surface hover:text-ink'
                  )}
                >
                  {option.label}
                  {option.value === range && (
                    <Check size={14} strokeWidth={2} className="shrink-0 text-sage" />
                  )}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ActivityListCard({
  incidents,
  isLoading,
  isError,
  onRetry,
  range,
  onRangeChange,
  onSelect,
}: ActivityListCardProps): JSX.Element {
  return (
    <section
      className="flex h-full flex-col rounded-card bg-card p-6 shadow-soft"
      aria-label="Recent incidents"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold text-ink">Recent incidents</h2>
        <RangeMenu range={range} onRangeChange={onRangeChange} />
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
          All clear — no incidents in the {rangeLabel(range).toLowerCase()}.
        </p>
      ) : (
        <ul className="mt-2">
          {incidents.map((incident) => {
            const KindIcon = iconForType(incident.type);
            const primaryLabel = incident.camera?.name ?? incident.zone.name;
            return (
              <li key={incident.id}>
                <button
                  type="button"
                  onClick={() => onSelect(incident.id)}
                  aria-label={`Open incident ${incident.incidentNumber}`}
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
                      {primaryLabel} · {prettyEnum(incident.type)}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {incident.site.name} · {incident.incidentNumber}
                    </span>
                  </span>
                  <AvatarStack
                    names={incident.assignedTo ? [incident.assignedTo.email] : []}
                    className="hidden shrink-0 sm:flex"
                  />
                  <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted">
                    {timeAgo(incident.lastDetectedAt)}
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
