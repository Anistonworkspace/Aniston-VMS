import { MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui';
import type { HealthSummary } from '@/types/vms';

// "Camera health" donut — docs/04-uiux-brief.md §7 Row 2 (reference Storage
// card). Plain SVG, no chart library; slices in sage/sand/coral/indigo with
// the uptime share centered and a 2×2 dot legend.
interface Segment {
  label: string;
  value: number;
  stroke: string;
  dot: string;
}

function segmentsOf(health: HealthSummary): Segment[] {
  return [
    { label: 'Healthy', value: health.healthy, stroke: 'text-sage', dot: 'bg-sage' },
    { label: 'Warning', value: health.warning, stroke: 'text-sand-deep', dot: 'bg-sand-deep' },
    { label: 'Critical', value: health.critical, stroke: 'text-coral', dot: 'bg-coral' },
    { label: 'Maintenance', value: health.maintenance, stroke: 'text-indigo', dot: 'bg-indigo' },
  ];
}

const RADIUS = 64;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function DonutChart({ segments, center }: { segments: Segment[]; center: string }): JSX.Element {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const gap = CIRCUMFERENCE * 0.015;
  let offset = 0;
  return (
    <div className="relative h-44 w-44">
      <svg
        viewBox="0 0 176 176"
        className="h-full w-full -rotate-90"
        role="img"
        aria-label={`Camera health: ${segments.map((s) => `${s.label} ${s.value}`).join(', ')}`}
      >
        {segments
          .filter((s) => s.value > 0)
          .map((s) => {
            const length = (s.value / total) * CIRCUMFERENCE;
            const circle = (
              <circle
                key={s.label}
                cx="88"
                cy="88"
                r={RADIUS}
                fill="none"
                stroke="currentColor"
                strokeWidth="26"
                strokeDasharray={`${Math.max(length - gap, 2)} ${CIRCUMFERENCE}`}
                strokeDashoffset={-offset}
                className={s.stroke}
              />
            );
            offset += length;
            return circle;
          })}
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-heading text-[26px] font-semibold tabular-nums text-ink">
          {center}
        </span>
      </div>
    </div>
  );
}

interface DonutCardProps {
  health?: HealthSummary;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function DonutCard({ health, isLoading, isError, onRetry }: DonutCardProps): JSX.Element {
  return (
    <section className="rounded-card bg-card p-6 shadow-soft" aria-label="Camera health">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold text-ink">Camera health</h2>
        <button
          type="button"
          aria-label="Camera health menu"
          className="rounded-control p-1 text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
        >
          <MoreVertical size={18} strokeWidth={1.5} />
        </button>
      </div>

      {isLoading ? (
        <div className="mt-6 flex flex-col items-center gap-6">
          <Skeleton variant="circle" width={176} height={176} />
          <div className="grid w-full grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} variant="line" width="80%" />
            ))}
          </div>
        </div>
      ) : isError || !health ? (
        <div className="mt-6 pb-4 text-center">
          <p className="text-sm text-muted">Couldn&apos;t load camera health.</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-control bg-sage px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-sage-hover"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="mt-6 flex justify-center">
            <DonutChart
              segments={segmentsOf(health)}
              center={`${health.uptimePercent.toFixed(1)}%`}
            />
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4">
            {segmentsOf(health).map((s) => (
              <div key={s.label} className="flex items-start gap-2.5">
                <span className={cn('mt-1.5 h-2 w-2 rounded-full', s.dot)} aria-hidden />
                <div>
                  <dt className="text-sm font-medium text-ink">{s.label}</dt>
                  <dd className="text-sm tabular-nums text-muted">{s.value}</dd>
                </div>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
