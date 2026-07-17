import { Cctv, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ZoneState, ZoneSummary } from '@/types/vms';

// Pastel folder-style zone card — docs/04-uiux-brief.md §7 Row 1.
// Tint by state: sage = all healthy · sand = warnings ·
// coral-soft = has critical · indigo = maintenance-heavy.
const TINTS: Record<ZoneState, { card: string; onDark: boolean }> = {
  healthy: { card: 'bg-sage text-white', onDark: true },
  maintenance: { card: 'bg-indigo text-white', onDark: true },
  warning: { card: 'bg-sand text-ink', onDark: false },
  critical: { card: 'bg-coral-soft text-ink', onDark: false },
};

function metaLine(zone: ZoneSummary): string {
  const cams = `${zone.cameraCount} cameras`;
  if (zone.criticalCount > 0) return `${cams} · ${zone.criticalCount} critical`;
  if (zone.warningCount > 0)
    return `${cams} · ${zone.warningCount} warning${zone.warningCount > 1 ? 's' : ''}`;
  if (zone.maintenanceCount > 0) return `${cams} · ${zone.maintenanceCount} in maintenance`;
  return `${cams} · all healthy`;
}

interface ZoneCardProps {
  zone: ZoneSummary;
  index: number;
}

export function ZoneCard({ zone, index }: ZoneCardProps): JSX.Element {
  const tint = TINTS[zone.state];
  return (
    <article
      className={cn(
        'flex h-52 flex-col rounded-card p-4 shadow-soft transition-shadow duration-150 hover:shadow-soft-hover',
        tint.card
      )}
    >
      <div className="flex items-start justify-between">
        <span
          className={cn('text-sm font-medium tabular-nums', tint.onDark ? 'text-white/70' : 'text-muted')}
        >
          {String(index + 1).padStart(2, '0')}
        </span>
        <button
          type="button"
          aria-label={`Zone ${zone.name} menu`}
          className={cn(
            'rounded-control p-1 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage',
            tint.onDark ? 'text-white/70 hover:text-white' : 'text-muted hover:text-ink'
          )}
        >
          <MoreVertical size={18} strokeWidth={1.5} />
        </button>
      </div>
      <div className="grid flex-1 place-items-center">
        <Cctv size={30} strokeWidth={1.5} className={tint.onDark ? 'text-white' : 'text-ink'} />
      </div>
      <div className="pb-1 text-center">
        <h3 className="font-heading text-base font-semibold">{zone.name}</h3>
        <p className={cn('mt-0.5 text-xs', tint.onDark ? 'text-white/75' : 'text-muted')}>
          {metaLine(zone)}
        </p>
      </div>
    </article>
  );
}
