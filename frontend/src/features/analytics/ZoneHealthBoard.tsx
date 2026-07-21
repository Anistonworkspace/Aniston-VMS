import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { ZoneRollup } from './analytics.types';

type StatusKey = 'healthy' | 'warning' | 'critical' | 'maintenance' | 'unknown';

// Solid variants of the state-* design tokens used by CameraStatusBadge.
const SEGMENTS: ReadonlyArray<{ key: StatusKey; className: string; label: string }> = [
  { key: 'healthy', className: 'bg-state-healthy', label: 'Healthy' },
  { key: 'warning', className: 'bg-state-warning', label: 'Warning' },
  { key: 'critical', className: 'bg-state-critical', label: 'Critical' },
  { key: 'maintenance', className: 'bg-state-maintenance', label: 'Maintenance' },
  { key: 'unknown', className: 'bg-state-unknown', label: 'Unknown' },
];

/** Per-zone status mix (stacked bar) + average health score, from GET /zones/health-rollup. */
export function ZoneHealthBoard({ rollups }: { rollups: ZoneRollup[] }): JSX.Element {
  return (
    <Card>
      <CardHeader className="mb-2 flex-col items-start gap-0.5">
        <CardTitle>Zone health</CardTitle>
        <CardDescription>Status mix and average health score per zone</CardDescription>
      </CardHeader>

      {rollups.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No zones in your scope.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {rollups.map((zone) => (
            <li key={zone.zoneId} className="flex items-center gap-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium text-ink">{zone.zoneName}</p>
                  <p className="shrink-0 text-xs text-muted">
                    {zone.region.name} · {zone.siteCount} sites · {zone.cameraCount} cameras
                  </p>
                </div>
                <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-hairline">
                  {zone.cameraCount > 0 &&
                    SEGMENTS.map(({ key, className, label }) =>
                      zone[key] > 0 ? (
                        <div
                          key={key}
                          title={`${label}: ${zone[key]}`}
                          className={className}
                          style={{ width: `${(zone[key] / zone.cameraCount) * 100}%` }}
                        />
                      ) : null
                    )}
                </div>
              </div>
              <div className="w-12 shrink-0 text-right">
                <p className="font-heading text-sm font-semibold text-ink">
                  {zone.avgHealthScore}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-muted">score</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-3 border-t border-hairline pt-3">
        {SEGMENTS.map(({ key, className, label }) => (
          <span key={key} className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span className={cn('h-2 w-2 rounded-full', className)} aria-hidden />
            {label}
          </span>
        ))}
      </div>
    </Card>
  );
}
