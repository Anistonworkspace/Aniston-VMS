import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Camera,
  Cctv,
  Flame,
  MonitorPlay,
  ShieldCheck,
  VideoOff,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';
import type {
  CameraStatus,
  DashboardOverview,
  EvidenceSnapshot,
  MissingSnapshot,
  WorstConnection,
} from '@/types/vms';
import { ActivityListCard } from './ActivityListCard';
import { DonutCard } from './DonutCard';
import { ZoneCard } from './ZoneCard';
import { timeAgo } from './timeAgo';
import {
  useGetDashboardOverviewQuery,
  useGetHealthSummaryQuery,
  useGetLatestEvidenceQuery,
  useListZoneSummariesQuery,
} from './overview.api';
import { useListIncidentsQuery } from '@/features/incidents/incidents.api';
import { IncidentDetailModal } from './IncidentDetailModal';
import { rangeFromISO, type IncidentRange } from './incidentRange';

// Overview ("/") — signature dashboard layout, docs/04-uiux-brief.md §6–7:
// hero left · CR-2 KPI row right · zone-cards row · donut + incidents ·
// CR-2 worst-connections / missing-snapshots widgets.

// ── CR-2 KPI tile ──────────────────────────────────────────────────────────
// Eight scope-aware tiles whose live counts link to the matching filtered list.
type KpiAccent = 'neutral' | 'sage' | 'coral' | 'sand' | 'indigo';

const KPI_ACCENT: Record<KpiAccent, { chip: string; icon: string }> = {
  neutral: { chip: 'bg-canvas', icon: 'text-muted' },
  sage: { chip: 'bg-sage-soft', icon: 'text-sage' },
  coral: { chip: 'bg-coral-soft', icon: 'text-coral' },
  sand: { chip: 'bg-sand', icon: 'text-sand-deep' },
  indigo: { chip: 'bg-indigo-soft', icon: 'text-indigo' },
};

interface KpiTileProps {
  to: string;
  label: string;
  value: number | string;
  icon: LucideIcon;
  accent: KpiAccent;
}

function KpiTile({ to, label, value, icon: Icon, accent }: KpiTileProps): JSX.Element {
  const a = KPI_ACCENT[accent];
  return (
    <Link
      to={to}
      className="flex flex-col rounded-card bg-card p-4 shadow-soft transition-shadow duration-150 hover:shadow-soft-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
    >
      <span className={cn('grid h-9 w-9 place-items-center rounded-control', a.chip)}>
        <Icon size={18} strokeWidth={1.5} className={a.icon} />
      </span>
      <p className="mt-5 font-heading text-[26px] font-semibold leading-none tabular-nums text-ink">
        {value}
      </p>
      <p className="mt-1 text-xs font-medium text-muted">{label}</p>
    </Link>
  );
}

function KpiRow({
  overview,
  isLoading,
  isError,
  onRetry,
}: {
  overview?: DashboardOverview;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}): JSX.Element {
  if (isError) {
    return (
      <div className="grid h-full min-h-[13rem] place-items-center rounded-card bg-card shadow-soft">
        <div className="text-center">
          <p className="text-sm text-muted">Couldn&apos;t load fleet metrics.</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-control bg-sage px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-sage-hover"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !overview) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-card" />
        ))}
      </div>
    );
  }

  const c = overview.cameras;
  const tiles: KpiTileProps[] = [
    { to: '/cameras', label: 'Total cameras', value: c.total, icon: Cctv, accent: 'neutral' },
    {
      to: '/cameras?status=HEALTHY',
      label: 'Healthy',
      value: c.healthy,
      icon: ShieldCheck,
      accent: 'sage',
    },
    {
      to: '/cameras?status=CRITICAL',
      label: 'Unavailable / Offline',
      value: c.offline,
      icon: VideoOff,
      accent: 'coral',
    },
    {
      to: '/cameras?status=WARNING',
      label: 'Warning',
      value: c.warning,
      icon: AlertTriangle,
      accent: 'sand',
    },
    {
      to: '/cameras?status=MAINTENANCE',
      label: 'Maintenance',
      value: c.maintenance,
      icon: Wrench,
      accent: 'indigo',
    },
    {
      to: '/incidents',
      label: 'Open incidents',
      value: overview.openIncidents,
      icon: Flame,
      accent: 'coral',
    },
    {
      to: '/reports',
      label: 'Snapshot success (24 h)',
      value: `${overview.snapshotSuccess.percent}%`,
      icon: Camera,
      accent: 'sage',
    },
    {
      to: '/live',
      label: 'Active live sessions',
      value: overview.activeLiveSessions,
      icon: MonitorPlay,
      accent: 'indigo',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {tiles.map((t) => (
        <KpiTile key={t.label} {...t} />
      ))}
    </div>
  );
}

// ── CR-2 widgets ─────────────────────────────────────────────────────────────
const STATUS_DOT: Record<CameraStatus, string> = {
  HEALTHY: 'bg-sage',
  WARNING: 'bg-sand-deep',
  CRITICAL: 'bg-coral',
  MAINTENANCE: 'bg-indigo',
  UNKNOWN: 'bg-muted',
};

const ROW_LINK =
  '-mx-2 flex items-center gap-3 rounded-control px-2 py-2.5 transition-colors duration-150 hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage';

function WidgetCard({
  title,
  isLoading,
  isError,
  isEmpty,
  emptyText,
  onRetry,
  children,
}: {
  title: string;
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  emptyText: string;
  onRetry: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <article className="rounded-card bg-card p-5 shadow-soft">
      <h3 className="font-heading text-base font-semibold text-ink">{title}</h3>
      {isError ? (
        <div className="mt-4">
          <p className="text-sm text-muted">Couldn&apos;t load {title.toLowerCase()}.</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 rounded-control bg-sage px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-sage-hover"
          >
            Retry
          </button>
        </div>
      ) : isLoading ? (
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="line" width="100%" />
          ))}
        </div>
      ) : isEmpty ? (
        <p className="mt-4 text-sm text-muted">{emptyText}</p>
      ) : (
        <ul className="mt-2 divide-y divide-hairline">{children}</ul>
      )}
    </article>
  );
}

function WorstConnectionRow({ cam }: { cam: WorstConnection }): JSX.Element {
  return (
    <li>
      <Link to={`/cameras/${cam.cameraId}`} className={ROW_LINK}>
        <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[cam.status])} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{cam.name}</p>
          <p className="truncate text-xs text-muted">
            {cam.cameraCode} · {cam.siteName}
            {cam.diagnosis ? ` · ${cam.diagnosis}` : ''}
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
          {cam.healthScore}
        </span>
      </Link>
    </li>
  );
}

function MissingSnapshotRow({ cam }: { cam: MissingSnapshot }): JSX.Element {
  return (
    <li>
      <Link to={`/cameras/${cam.cameraId}`} className={ROW_LINK}>
        <span className="h-2 w-2 shrink-0 rounded-full bg-sand-deep" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{cam.name}</p>
          <p className="truncate text-xs text-muted">
            {cam.cameraCode} · {cam.siteName}
          </p>
        </div>
        <span className="shrink-0 text-xs text-muted">
          {cam.lastSnapshotAt ? timeAgo(cam.lastSnapshotAt) : 'never'}
        </span>
      </Link>
    </li>
  );
}

function EvidenceCard({ evidence }: { evidence?: EvidenceSnapshot | null }): JSX.Element {
  return (
    <article className="relative h-52 overflow-hidden rounded-card bg-charcoal shadow-soft">
      {evidence ? (
        // Real newest EVIDENCE snapshot via its signed, short-lived thumbnail URL.
        <img
          src={evidence.imageUrl}
          alt={`Latest evidence from ${evidence.cameraLabel}`}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
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
      )}
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
    data: overview,
    isLoading: overviewLoading,
    isError: overviewError,
    refetch: refetchOverview,
  } = useGetDashboardOverviewQuery();
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
  } = useListZoneSummariesQuery();
  const [range, setRange] = useState<IncidentRange>('24h');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  // Recompute the `from` bound only when the range changes so RTK Query keeps a
  // stable cache key instead of refetching on every render tick.
  const incidentsFrom = useMemo(() => rangeFromISO(range), [range]);
  const {
    data: incidents,
    isLoading: incidentsLoading,
    isError: incidentsError,
    refetch: refetchIncidents,
  } = useListIncidentsQuery({ from: incidentsFrom, limit: 8 });
  const { data: evidence } = useGetLatestEvidenceQuery();

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

      {/* CR-2 KPI row — 8 scope-aware tiles linking to filtered lists */}
      <section className="col-span-12 self-center xl:col-span-8" aria-label="Fleet metrics">
        <KpiRow
          overview={overview}
          isLoading={overviewLoading}
          isError={overviewError}
          onRetry={() => void refetchOverview()}
        />
      </section>

      {/* Row 1 — zone cards (pastel zones · latest evidence) */}
      <section className="col-span-12" aria-label="Zones">
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
          <div className="grid grid-cols-2 gap-6 md:grid-cols-3">
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
          range={range}
          onRangeChange={setRange}
          onSelect={setSelectedIncidentId}
        />
      </div>

      <IncidentDetailModal
        incidentId={selectedIncidentId}
        onClose={() => setSelectedIncidentId(null)}
      />

      {/* Row 3 — CR-2 widgets: worst connections · missing snapshots */}
      <div className="col-span-12 xl:col-span-6">
        <WidgetCard
          title="Worst connections"
          isLoading={overviewLoading}
          isError={overviewError}
          isEmpty={!overview || overview.worstConnections.length === 0}
          emptyText="No degraded cameras in your scope — all healthy."
          onRetry={() => void refetchOverview()}
        >
          {overview?.worstConnections.map((cam) => (
            <WorstConnectionRow key={cam.cameraId} cam={cam} />
          ))}
        </WidgetCard>
      </div>
      <div className="col-span-12 xl:col-span-6">
        <WidgetCard
          title="Missing snapshots"
          isLoading={overviewLoading}
          isError={overviewError}
          isEmpty={!overview || overview.missingSnapshots.length === 0}
          emptyText="Every in-service camera has a fresh snapshot."
          onRetry={() => void refetchOverview()}
        >
          {overview?.missingSnapshots.map((cam) => (
            <MissingSnapshotRow key={cam.cameraId} cam={cam} />
          ))}
        </WidgetCard>
      </div>
    </div>
  );
}
