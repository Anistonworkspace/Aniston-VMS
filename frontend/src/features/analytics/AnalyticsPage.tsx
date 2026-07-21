import { RefreshCw } from 'lucide-react';
import { Button, Card, Skeleton } from '@/components/ui';
import { getApiErrorMessage } from '@/lib/apiError';
import { useGetFleetHealthQuery, useGetZoneRollupsQuery } from './analytics.api';
import { FleetSummaryCards } from './FleetSummaryCards';
import { QualityTrendPanel } from './QualityTrendPanel';
import { RootCausePanel } from './RootCausePanel';
import { ZoneHealthBoard } from './ZoneHealthBoard';

/**
 * PRD §6.9/§6.10 analytics: fleet KPIs, per-zone health rollup, root-cause
 * distribution ("Needs cleaning" list) and connection-quality trends. All data
 * comes from the Stage 2 health module — see analytics.api.ts.
 */
export function AnalyticsPage(): JSX.Element {
  const fleet = useGetFleetHealthQuery();
  const rollups = useGetZoneRollupsQuery();

  const isLoading = fleet.isLoading || rollups.isLoading;
  const error = fleet.error ?? rollups.error;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-ink">Analytics</h1>
          <p className="mt-1 text-sm text-muted">
            Fleet health, root-cause diagnosis and connection quality trends
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<RefreshCw size={14} />}
          onClick={() => {
            void fleet.refetch();
            void rollups.refetch();
          }}
        >
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-80 w-full rounded-2xl lg:col-span-2" />
            <Skeleton className="h-80 w-full rounded-2xl" />
          </div>
        </div>
      ) : error ? (
        <Card className="py-10 text-center">
          <p className="text-sm text-state-critical">{getApiErrorMessage(error)}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mx-auto mt-4"
            onClick={() => {
              void fleet.refetch();
              void rollups.refetch();
            }}
          >
            Try again
          </Button>
        </Card>
      ) : (
        <>
          <FleetSummaryCards rows={fleet.data ?? []} />
          <div className="grid items-start gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ZoneHealthBoard rollups={rollups.data ?? []} />
            </div>
            <RootCausePanel rows={fleet.data ?? []} />
          </div>
          <QualityTrendPanel cameras={fleet.data ?? []} />
        </>
      )}
    </div>
  );
}
