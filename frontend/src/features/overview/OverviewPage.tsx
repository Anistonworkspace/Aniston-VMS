import { Plus } from 'lucide-react';
import { Skeleton } from '@/components/ui';
import { canManageRegistry, type EvidenceSnapshot } from '@/types/vms';
import { ActivityListCard } from './ActivityListCard';
import { DonutCard } from './DonutCard';
import { ZoneCard } from './ZoneCard';
import { timeAgo } from './timeAgo';
import {
  useGetCurrentUserQuery,
  useGetHealthSummaryQuery,
  useGetLatestEvidenceQuery,
  useListRecentIncidentsQuery,
  useListZonesQuery,
} from './overview.api';

// Overview ("/") — signature dashboard layout, docs/04-uiux-brief.md §6–7:
// hero left · zone-cards row right · donut under hero · incidents list right.
function AddZoneTile(): JSX.Element {
  return (
    <article className="grid h-52 place-items-center rounded-card border-2 border-dashed border-sidebar-muted">
      <button
        type="button"
        aria-label="Add zone"
        className="grid h-11 w-11 place-items-center rounded-full bg-card text-ink shadow-soft transition-shadow duration-150 hover:shadow-soft-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
      >
        <Plus size={20} strokeWidth={1.5} />
      </button>
    </article>
  );
}

function EvidenceCard({ evidence }: { evidence?: EvidenceSnapshot }): JSX.Element {
  return (
    <article className="relative h-52 overflow-hidden rounded-card bg-charcoal shadow-soft">
      {/* MOCK: abstract art stands in for the newest snapshot until Stage 2 */}
      <svg
        viewBox="0 0 200 200"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <circle cx="150" cy="42" r="55" className="fill-coral" />
        <rect
          x="-24"
          y="86"
          width="130"
          height="130"
          rx="28"
          transform="rotate(-18 40 160)"
          className="fill-indigo"
        />
        <path d="M120 200 L200 120 L200 200 Z" className="fill-sand" />
      </svg>
      <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-transparent to-transparent" />
      <div className="absolute inset-x-4 bottom-4">
        <h3 className="font-heading text-base font-semibold text-white">Latest evidence</h3>
        <p className="mt-0.5 truncate text-xs text-white/75">
          {evidence
            ? `${evidence.cameraLabel} · ${evidence.siteName} · ${timeAgo(evidence.capturedAt)}`
            : 'Awaiting first snapshot'}
        </p>
      </div>
    </article>
  );
}

export function OverviewPage(): JSX.Element {
  const {
    data: health,
    isLoading: healthLoading,
    isError: healthError,
    refetch: refetchHealth,
  } = useGetHealthSummaryQuery();
  const {
    data: zones,
    isLoading: zonesLoading,
    isError: zonesError,
    refetch: refetchZones,
  } = useListZonesQuery();
  const {
    data: incidents,
    isLoading: incidentsLoading,
    isError: incidentsError,
    refetch: refetchIncidents,
  } = useListRecentIncidentsQuery();
  const { data: evidence } = useGetLatestEvidenceQuery();
  const { data: user } = useGetCurrentUserQuery();

  const isAdmin = user ? canManageRegistry(user.role) : false;
  const featuredZones = zones
    ? [...zones].sort((a, b) => b.cameraCount - a.cameraCount).slice(0, 2)
    : [];

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Hero — §6 */}
      <section className="col-span-12 self-center xl:col-span-4">
        <h2 className="font-heading text-[34px] font-semibold leading-[1.15] text-ink xl:text-[38px]">
          Every camera,
          <br />
          at a glance
        </h2>
        {healthLoading ? (
          <div className="mt-4 max-w-xs space-y-2">
            <Skeleton variant="line" width="90%" />
            <Skeleton variant="line" width="60%" />
          </div>
        ) : (
          <p className="mt-4 max-w-xs text-md text-muted">
            {health
              ? `${health.totalCameras} cameras across ${health.zoneCount} Delhi zones — health, incidents and evidence in one place.`
              : 'Health, incidents and evidence in one place.'}
          </p>
        )}
      </section>

      {/* Row 1 — zone cards (dashed add tile · pastel zones · latest evidence) */}
      <section className="col-span-12 xl:col-span-8" aria-label="Zones">
        {zonesError ? (
          <div className="grid h-52 place-items-center rounded-card bg-card shadow-soft">
            <div className="text-center">
              <p className="text-sm text-muted">Couldn&apos;t load zones.</p>
              <button
                type="button"
                onClick={() => void refetchZones()}
                className="mt-3 rounded-control bg-sage px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-sage-hover"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {isAdmin && <AddZoneTile />}
            {zonesLoading ? (
              [0, 1].map((i) => <Skeleton key={i} className="h-52 rounded-card" />)
            ) : featuredZones.length === 0 ? (
              <div className="col-span-2 grid h-52 place-items-center rounded-card bg-card text-sm text-muted shadow-soft">
                No zones in your scope yet.
              </div>
            ) : (
              featuredZones.map((zone, i) => <ZoneCard key={zone.id} zone={zone} index={i} />)
            )}
            <EvidenceCard evidence={evidence} />
          </div>
        )}
      </section>

      {/* Row 2 — donut + incidents */}
      <div className="col-span-12 xl:col-span-4">
        <DonutCard
          health={health}
          isLoading={healthLoading}
          isError={healthError}
          onRetry={() => void refetchHealth()}
        />
      </div>
      <div className="col-span-12 xl:col-span-8">
        <ActivityListCard
          incidents={incidents}
          isLoading={incidentsLoading}
          isError={incidentsError}
          onRetry={() => void refetchIncidents()}
        />
      </div>
    </div>
  );
}
