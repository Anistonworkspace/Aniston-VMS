import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LayoutGrid, List, RefreshCw } from 'lucide-react';
import { Button, SkeletonCard, ToastContainer } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { timeAgo } from '@/features/overview/timeAgo';
import { getApiErrorMessage } from '@/lib/apiError';
import { prettyEnum } from '@/lib/prettyEnum';
import { cn } from '@/lib/utils';
import { IncidentStatusChip, SeverityBadge } from './IncidentBadges';
import { IncidentDetailDrawer } from './IncidentDetailDrawer';
import { KANBAN_COLUMNS, OPEN_STATUSES } from './incidents.constants';
import { useGetIncidentSummaryQuery, useListIncidentsQuery } from './incidents.api';
import type { IncidentListItem, IncidentSeverity, IncidentStatus } from './incidents.types';

const SEVERITY_RANK: Record<IncidentSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

function byPriority(a: IncidentListItem, b: IncidentListItem): number {
  return (
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    new Date(b.lastDetectedAt).getTime() - new Date(a.lastDetectedAt).getTime()
  );
}

const selectClass =
  'h-9 rounded-lg border border-gray-200 bg-white/70 px-3 text-sm text-gray-900 backdrop-blur-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500';

function IncidentCard({
  incident,
  onOpen,
}: {
  incident: IncidentListItem;
  onOpen: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-tile bg-card p-3 text-left shadow-soft transition-shadow hover:shadow-soft-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold tabular-nums text-ink">
          {incident.incidentNumber}
        </span>
        <SeverityBadge severity={incident.severity} />
      </div>
      <p className="mt-1.5 truncate text-sm font-medium text-ink">{prettyEnum(incident.type)}</p>
      <p className="mt-0.5 truncate text-xs text-gray-500">
        {incident.camera
          ? `${incident.camera.cameraCode} · ${incident.camera.name}`
          : `Site · ${incident.site.name}`}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-400">
        <span className="shrink-0">{timeAgo(incident.lastDetectedAt)}</span>
        {incident.assignedTo && <span className="truncate">{incident.assignedTo.email}</span>}
      </div>
    </button>
  );
}

export function IncidentsPage(): JSX.Element {
  const navigate = useNavigate();
  const { incidentId } = useParams<{ incidentId: string }>();
  const { toasts, dismiss, success, error: notifyError } = useToast();

  const [view, setView] = useState<'board' | 'list'>('board');
  const [severity, setSeverity] = useState<'' | IncidentSeverity>('');
  const [statusFilter, setStatusFilter] = useState<'' | IncidentStatus>('');
  // CR-7 date window — `<input type="date">` values (yyyy-mm-dd, local).
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const dateParams = useMemo(() => {
    // `from` inclusive start-of-day; `to` exclusive — send start of the NEXT day.
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined;
    let to: string | undefined;
    if (toDate) {
      const end = new Date(`${toDate}T00:00:00`);
      end.setDate(end.getDate() + 1);
      to = end.toISOString();
    }
    return { from, to };
  }, [fromDate, toDate]);

  const {
    data: incidents,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useListIncidentsQuery({
    limit: 200,
    severity: severity || undefined,
    from: dateParams.from,
    to: dateParams.to,
  });
  const { data: summary } = useGetIncidentSummaryQuery();

  const openCount = useMemo(
    () =>
      summary ? OPEN_STATUSES.reduce((total, status) => total + (summary[status] ?? 0), 0) : null,
    [summary]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, IncidentListItem[]>(
      KANBAN_COLUMNS.map((column) => [column.key, []])
    );
    for (const incident of incidents ?? []) {
      const column = KANBAN_COLUMNS.find((entry) => entry.statuses.includes(incident.status));
      const bucket = column ? map.get(column.key) : undefined;
      if (bucket) bucket.push(incident);
    }
    for (const bucket of map.values()) bucket.sort(byPriority);
    return map;
  }, [incidents]);

  const listRows = useMemo(
    () =>
      (incidents ?? [])
        .filter((incident) => !statusFilter || incident.status === statusFilter)
        .slice()
        .sort(
          (a, b) => new Date(b.lastDetectedAt).getTime() - new Date(a.lastDetectedAt).getTime()
        ),
    [incidents, statusFilter]
  );

  const allStatuses = useMemo(() => KANBAN_COLUMNS.flatMap((column) => column.statuses), []);

  function openIncident(id: string): void {
    navigate(`/incidents/${id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-ink">Incidents</h1>
          <p className="mt-1 text-sm text-gray-500">
            {openCount != null ? `${openCount} open · ` : ''}
            Camera &amp; site fault lifecycle
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={severity}
            onChange={(event) => setSeverity(event.target.value as '' | IncidentSeverity)}
            aria-label="Filter by severity"
            className={selectClass}
          >
            <option value="">All severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="WARNING">Warning</option>
            <option value="INFO">Info</option>
          </select>
          <input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(event) => setFromDate(event.target.value)}
            aria-label="Detected from date"
            className={selectClass}
          />
          <input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(event) => setToDate(event.target.value)}
            aria-label="Detected to date"
            className={selectClass}
          />
          {(fromDate || toDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFromDate('');
                setToDate('');
              }}
            >
              Clear dates
            </Button>
          )}
          {view === 'list' && (
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as '' | IncidentStatus)}
              aria-label="Filter by status"
              className={selectClass}
            >
              <option value="">All statuses</option>
              {allStatuses.map((status) => (
                <option key={status} value={status}>
                  {prettyEnum(status)}
                </option>
              ))}
            </select>
          )}
          <div className="flex rounded-control bg-charcoal/5 p-0.5" role="group" aria-label="View">
            <button
              type="button"
              onClick={() => setView('board')}
              aria-pressed={view === 'board'}
              className={cn(
                'flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors',
                view === 'board' ? 'bg-card text-ink shadow-soft' : 'text-gray-500 hover:text-ink'
              )}
            >
              <LayoutGrid size={14} strokeWidth={1.5} />
              Board
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
              className={cn(
                'flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors',
                view === 'list' ? 'bg-card text-ink shadow-soft' : 'text-gray-500 hover:text-ink'
              )}
            >
              <List size={14} strokeWidth={1.5} />
              List
            </button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            loading={isFetching && !isLoading}
            leftIcon={<RefreshCw size={14} />}
            onClick={() => refetch()}
          >
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-card bg-card p-10 text-center shadow-soft">
          <p className="text-sm text-gray-600">{getApiErrorMessage(error)}</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {KANBAN_COLUMNS.map((column) => (
            <SkeletonCard key={column.key} />
          ))}
        </div>
      ) : view === 'board' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {KANBAN_COLUMNS.map((column) => {
            const items = grouped.get(column.key) ?? [];
            return (
              <section key={column.key} className="rounded-card bg-charcoal/[0.03] p-3">
                <header className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold text-ink">{column.title}</h2>
                  <span className="text-xs tabular-nums text-gray-400">{items.length}</span>
                </header>
                <div className="mt-3 space-y-2.5">
                  {items.length === 0 ? (
                    <p className="rounded-tile border border-dashed border-gray-200 p-3 text-center text-xs text-gray-400">
                      None
                    </p>
                  ) : (
                    items.map((incident) => (
                      <IncidentCard
                        key={incident.id}
                        incident={incident}
                        onOpen={() => openIncident(incident.id)}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : listRows.length === 0 ? (
        <div className="rounded-card bg-card p-10 text-center shadow-soft">
          <p className="text-sm text-gray-500">No incidents match the current filters.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card bg-card shadow-soft">
          <div className="hidden grid-cols-[1.3fr_0.9fr_1fr_1.5fr_1fr_0.9fr] gap-3 border-b border-gray-100 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-gray-400 md:grid">
            <span>Incident</span>
            <span>Severity</span>
            <span>Status</span>
            <span>Camera</span>
            <span>Zone</span>
            <span>Detected</span>
          </div>
          <ul className="divide-y divide-gray-100">
            {listRows.map((incident) => (
              <li key={incident.id}>
                <button
                  type="button"
                  onClick={() => openIncident(incident.id)}
                  className="grid w-full grid-cols-2 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 md:grid-cols-[1.3fr_0.9fr_1fr_1.5fr_1fr_0.9fr]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium tabular-nums text-ink">
                      {incident.incidentNumber}
                    </span>
                    <span className="block truncate text-xs text-gray-500">
                      {prettyEnum(incident.type)}
                    </span>
                  </span>
                  <span>
                    <SeverityBadge severity={incident.severity} />
                  </span>
                  <span>
                    <IncidentStatusChip status={incident.status} />
                  </span>
                  <span className="truncate text-sm text-gray-600">
                    {incident.camera
                      ? `${incident.camera.cameraCode} · ${incident.camera.name}`
                      : `Site · ${incident.site.name}`}
                  </span>
                  <span className="truncate text-sm text-gray-600">{incident.zone.name}</span>
                  <span className="truncate text-xs text-gray-400">
                    {timeAgo(incident.lastDetectedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <IncidentDetailDrawer
        incidentId={incidentId ?? null}
        onClose={() => navigate('/incidents')}
        notify={{ success, error: notifyError }}
      />
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
