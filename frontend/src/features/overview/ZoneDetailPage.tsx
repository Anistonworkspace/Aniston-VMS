import { Link, useParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Camera,
  Cctv,
  ChevronRight,
  Gauge,
  MonitorPlay,
  ShieldCheck,
  VideoOff,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { CameraStatus, ZoneOverview } from '@/types/vms';
import { useGetZoneOverviewQuery } from './overview.api';
import { timeAgo } from './timeAgo';

// ─────────────────────────────────────────────────────────────────────────────
// CR-8 populated zone drill-down. Opened from the dashboard zone grid + sidebar
// zone rows (real zone IDs from GET /api/dashboard/zones). Every count/list is
// scope-filtered server-side (backend/src/modules/dashboard/dashboard.service).
// ─────────────────────────────────────────────────────────────────────────────

const ACCENT = {
  neutral: { chip: 'bg-canvas', icon: 'text-muted' },
  sage: { chip: 'bg-sage-soft', icon: 'text-sage' },
  coral: { chip: 'bg-coral-soft', icon: 'text-coral' },
  sand: { chip: 'bg-sand', icon: 'text-sand-deep' },
  indigo: { chip: 'bg-indigo-soft', icon: 'text-indigo' },
} as const;
type Accent = keyof typeof ACCENT;

const STATUS_DOT: Record<CameraStatus, string> = {
  HEALTHY: 'bg-sage',
  WARNING: 'bg-sand-deep',
  CRITICAL: 'bg-coral',
  MAINTENANCE: 'bg-indigo',
  UNKNOWN: 'bg-muted',
};

const STATUS_LABEL: Record<CameraStatus, string> = {
  HEALTHY: 'Healthy',
  WARNING: 'Warning',
  CRITICAL: 'Offline',
  MAINTENANCE: 'Maintenance',
  UNKNOWN: 'Unknown',
};

const ROW_LINK =
  '-mx-2 flex items-center gap-3 rounded-control px-2 py-2.5 transition-colors duration-150 hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage';

// Incident severity → badge. Prisma Severity is broader than the frontend union
// so this defaults gracefully for any unmapped value.
function severityBadge(severity: string): string {
  switch (severity.toUpperCase()) {
    case 'CRITICAL':
    case 'HIGH':
      return 'bg-coral-soft text-coral';
    case 'WARNING':
    case 'MEDIUM':
      return 'bg-sand text-sand-deep';
    default:
      return 'bg-canvas text-muted';
  }
}

function StatTile({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  accent: Accent;
}): JSX.Element {
  const a = ACCENT[accent];
  return (
    <div className="flex flex-col rounded-card bg-card p-4 shadow-soft">
      <span className={cn('grid h-9 w-9 place-items-center rounded-control', a.chip)}>
        <Icon size={18} strokeWidth={1.5} className={a.icon} />
      </span>
      <p className="mt-5 font-heading text-[26px] font-semibold leading-none tabular-nums text-ink">
        {value}
      </p>
      <p className="mt-1 text-xs font-medium text-muted">{label}</p>
    </div>
  );
}

function BackLink(): JSX.Element {
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-1.5 rounded-control text-sm font-medium text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
    >
      <ArrowLeft size={16} strokeWidth={1.5} />
      Dashboard
    </Link>
  );
}

function ZoneBody({ zone }: { zone: ZoneOverview }): JSX.Element {
  const { cameras } = zone;
  return (
    <>
      <div className="mt-3 flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-card bg-sage-soft">
          <Cctv size={22} strokeWidth={1.5} className="text-sage" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-heading text-2xl font-semibold text-ink">{zone.name}</h1>
          <p className="text-sm text-muted">
            {zone.region} region · {cameras.total} camera{cameras.total === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {/* KPI row — trailing-30 d uptime + live scope-aware counts */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Cameras" value={cameras.total} icon={Cctv} accent="neutral" />
        <StatTile label="Offline" value={cameras.offline} icon={VideoOff} accent="coral" />
        <StatTile label="Warning" value={cameras.warning} icon={AlertTriangle} accent="sand" />
        <StatTile label="Maintenance" value={cameras.maintenance} icon={Wrench} accent="indigo" />
        <StatTile
          label="Open incidents"
          value={zone.openIncidents}
          icon={ShieldCheck}
          accent="coral"
        />
        <StatTile
          label="Live sessions"
          value={zone.activeLiveSessions}
          icon={MonitorPlay}
          accent="sage"
        />
        <StatTile
          label="Snapshot success"
          value={`${zone.snapshotSuccess.percent}%`}
          icon={Camera}
          accent="sage"
        />
        <StatTile
          label="Uptime (30 d)"
          value={`${zone.uptimePercent}%`}
          icon={Gauge}
          accent="sage"
        />
      </div>

      {/* Sites breakdown */}
      <article className="mt-6 rounded-card bg-card p-5 shadow-soft">
        <h2 className="font-heading text-base font-semibold text-ink">
          Sites <span className="text-muted">({zone.sites.length})</span>
        </h2>
        {zone.sites.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No sites in scope for this zone.</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {zone.sites.map((site) => (
              <div key={site.id} className="rounded-control border border-black/5 bg-canvas p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium text-ink">{site.name}</p>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {site.cameraCount} cam{site.cameraCount === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-sage" /> {site.healthy} healthy
                  </span>
                  {site.offline > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-coral" /> {site.offline} offline
                    </span>
                  )}
                  {site.warning > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-sand-deep" /> {site.warning}{' '}
                      warning
                    </span>
                  )}
                  {site.maintenance > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo" /> {site.maintenance}{' '}
                      maint.
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Cameras roster */}
        <article className="rounded-card bg-card p-5 shadow-soft lg:col-span-2">
          <h2 className="font-heading text-base font-semibold text-ink">
            Cameras <span className="text-muted">({zone.cameraList.length})</span>
          </h2>
          {zone.cameraList.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No cameras in scope for this zone.</p>
          ) : (
            <ul className="mt-2 divide-y divide-black/5">
              {zone.cameraList.map((cam) => (
                <li key={cam.id}>
                  <Link
                    to={`/cameras/${cam.id}`}
                    className={ROW_LINK}
                    aria-label={`Open camera ${cam.cameraCode}`}
                  >
                    <span
                      className={cn('h-2.5 w-2.5 shrink-0 rounded-full', STATUS_DOT[cam.status])}
                      title={STATUS_LABEL[cam.status]}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        <span className="tabular-nums text-muted">{cam.cameraCode}</span> ·{' '}
                        {cam.name}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {cam.siteName}
                        {cam.lastSnapshotAt
                          ? ` · snapshot ${timeAgo(cam.lastSnapshotAt)}`
                          : ' · no snapshot'}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-medium tabular-nums text-muted">
                      {cam.healthScore}%
                    </span>
                    <ChevronRight size={16} strokeWidth={1.5} className="shrink-0 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>

        {/* Open incidents */}
        <article className="rounded-card bg-card p-5 shadow-soft">
          <h2 className="font-heading text-base font-semibold text-ink">
            Open incidents <span className="text-muted">({zone.incidents.length})</span>
          </h2>
          {zone.incidents.length === 0 ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted">
              <Activity size={16} strokeWidth={1.5} className="text-sage" />
              No open incidents in this zone.
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-black/5">
              {zone.incidents.map((inc) => (
                <li key={inc.id}>
                  <Link
                    to={`/incidents/${inc.id}`}
                    className={ROW_LINK}
                    aria-label={`Open incident ${inc.incidentNumber}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {inc.type.replace(/_/g, ' ')}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {inc.incidentNumber}
                        {inc.cameraCode ? ` · ${inc.cameraCode}` : ''} ·{' '}
                        {timeAgo(inc.firstDetectedAt)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize',
                        severityBadge(inc.severity)
                      )}
                    >
                      {inc.severity.toLowerCase()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </>
  );
}

export function ZoneDetailPage(): JSX.Element {
  const { zoneId } = useParams<{ zoneId: string }>();
  const { data, isLoading, isError, error, refetch } = useGetZoneOverviewQuery(zoneId ?? '', {
    skip: !zoneId,
  });

  const notFound = isError && (error as { status?: number } | undefined)?.status === 404;

  return (
    <div data-testid="zone-detail">
      <BackLink />

      {notFound ? (
        <div className="mt-8 rounded-card bg-card p-8 text-center shadow-soft">
          <h1 className="font-heading text-lg font-semibold text-ink">Zone not found</h1>
          <p className="mt-1 text-sm text-muted">
            This zone doesn&apos;t exist or is outside your access scope.
          </p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-control bg-sage px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-sage-hover"
          >
            Back to dashboard
          </Link>
        </div>
      ) : isError ? (
        <div className="mt-8 rounded-card bg-card p-8 text-center shadow-soft">
          <h1 className="font-heading text-lg font-semibold text-ink">
            Couldn&apos;t load this zone
          </h1>
          <p className="mt-1 text-sm text-muted">
            Something went wrong fetching the zone overview.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 rounded-control bg-sage px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-sage-hover"
          >
            Retry
          </button>
        </div>
      ) : isLoading || !data ? (
        <>
          <div className="mt-3 flex items-center gap-3">
            <Skeleton variant="rect" width={44} height={44} />
            <div className="space-y-2">
              <Skeleton variant="line" width={220} height={20} />
              <Skeleton variant="line" width={140} height={12} />
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-card bg-card p-4 shadow-soft">
                <Skeleton variant="rect" width={36} height={36} />
                <div className="mt-5 space-y-2">
                  <Skeleton variant="line" width="50%" height={20} />
                  <Skeleton variant="line" width="70%" height={10} />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <ZoneBody zone={data} />
      )}
    </div>
  );
}
