import { useEffect, useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import { Archive, Check, ImageOff, Search, UserPlus, Wrench } from 'lucide-react';
import { Button, Drawer, Input, Skeleton } from '@/components/ui';
import { useGetCurrentUserQuery } from '@/features/auth/auth.api';
import { isAdminRole, isOperatorPlusRole } from '@/features/auth/auth.types';
import { useListCameraSnapshotsQuery } from '@/features/cameras/cameras.api';
import { timeAgo } from '@/features/overview/timeAgo';
import { getApiErrorMessage } from '@/lib/apiError';
import { prettyEnum } from '@/lib/prettyEnum';
import { cn } from '@/lib/utils';
import { IncidentStatusChip, SeverityBadge } from './IncidentBadges';
import { OPEN_STATUSES } from './incidents.constants';
import {
  useAckIncidentMutation,
  useAssignIncidentMutation,
  useCloseIncidentMutation,
  useGetIncidentDetailQuery,
  useListAssignableUsersQuery,
  useMarkInvestigatingMutation,
  useResolveIncidentMutation,
} from './incidents.api';
import type { EvidenceRef, IncidentDetail } from './incidents.types';

function formatDowntime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

function Detail({ label, value }: { label: string; value?: string }): JSX.Element {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value || '—'}</dd>
    </div>
  );
}

function EvidenceTile({
  label,
  evidence,
  imageUrl,
}: {
  label: string;
  evidence: EvidenceRef | null;
  imageUrl?: string;
}): JSX.Element {
  return (
    <figure className="min-w-0 flex-1">
      <div className="relative h-32 overflow-hidden rounded-tile bg-charcoal/10">
        {evidence && imageUrl ? (
          <img
            src={imageUrl}
            alt={`${label} snapshot`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted">
            <ImageOff size={20} strokeWidth={1.5} />
          </div>
        )}
      </div>
      <figcaption className="mt-1.5 text-xs text-muted">
        {label}
        {evidence ? ` · ${timeAgo(evidence.capturedAt)}` : ' · not captured'}
      </figcaption>
    </figure>
  );
}

const textareaClass =
  'w-full rounded-lg border border-hairline bg-card p-3 text-sm text-ink placeholder:text-muted transition-colors hover:border-hairline focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage';

export interface IncidentDetailDrawerProps {
  incidentId: string | null;
  onClose: () => void;
  notify: {
    success: (title: string, description?: string) => void;
    error: (title: string, description?: string) => void;
  };
}

export function IncidentDetailDrawer({
  incidentId,
  onClose,
  notify,
}: IncidentDetailDrawerProps): JSX.Element {
  const [id, setId] = useState(incidentId);
  useEffect(() => {
    if (incidentId) setId(incidentId);
  }, [incidentId]);

  const { data: user } = useGetCurrentUserQuery();
  const canOperate = isOperatorPlusRole(user?.role);
  const isAdmin = isAdminRole(user?.role);

  const { data: incident, isLoading, error, refetch } = useGetIncidentDetailQuery(id ?? skipToken);
  // GET /users is admin-only — skip for other roles so we don't trigger 403s.
  const { data: users } = useListAssignableUsersQuery(undefined, { skip: !isAdmin });

  const [ack, { isLoading: acking }] = useAckIncidentMutation();
  const [assign, { isLoading: assigning }] = useAssignIncidentMutation();
  const [investigate, { isLoading: investigating }] = useMarkInvestigatingMutation();
  const [resolve, { isLoading: resolving }] = useResolveIncidentMutation();
  const [close, { isLoading: closing }] = useCloseIncidentMutation();

  const [assigneeId, setAssigneeId] = useState('');
  const [resolveOpen, setResolveOpen] = useState(false);
  const [rootCause, setRootCause] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [spareParts, setSpareParts] = useState('');

  // Evidence refs only carry {id, capturedAt} — resolve signed image URLs by
  // matching ids inside the camera's snapshot list (window capped at 336 h,
  // the backend max; older evidence degrades to a metadata-only tile).
  const refs = [incident?.previousSnapshot, incident?.faultSnapshot].filter(
    (ref): ref is EvidenceRef => !!ref
  );
  const earliest = refs.length
    ? Math.min(...refs.map((ref) => new Date(ref.capturedAt).getTime()))
    : null;
  const evidenceHours =
    earliest != null
      ? Math.min(336, Math.max(1, Math.ceil((Date.now() - earliest) / 3_600_000) + 1))
      : null;
  const { data: cameraSnapshots } = useListCameraSnapshotsQuery(
    incident?.cameraId && evidenceHours
      ? { cameraId: incident.cameraId, hours: evidenceHours, limit: 500 }
      : skipToken
  );
  const urlFor = (ref: EvidenceRef | null): string | undefined =>
    ref ? cameraSnapshots?.find((snapshot) => snapshot.id === ref.id)?.thumbUrl : undefined;

  const isOpen = !!incident && (OPEN_STATUSES as readonly string[]).includes(incident.status);
  const canAck = !!incident && !incident.acknowledgedAt && isOpen;
  const canInvestigate =
    !!incident && (incident.status === 'ACKNOWLEDGED' || incident.status === 'ASSIGNED');
  const canClose =
    !!incident && (incident.status === 'RESOLVED' || incident.status === 'RECOVERY_VERIFIED');

  async function run(action: () => Promise<unknown>, successTitle: string): Promise<void> {
    try {
      await action();
      notify.success(successTitle);
    } catch (err) {
      notify.error('Action failed', getApiErrorMessage(err as FetchBaseQueryError));
    }
  }

  async function handleResolve(): Promise<void> {
    if (!id) return;
    if (rootCause.trim().length < 3 || resolutionNotes.trim().length < 3) {
      notify.error(
        'Missing details',
        'Root cause and resolution notes need at least 3 characters.'
      );
      return;
    }
    try {
      await resolve({
        id,
        body: {
          rootCause: rootCause.trim(),
          resolutionNotes: resolutionNotes.trim(),
          correctiveAction: correctiveAction.trim() || undefined,
          spareParts: spareParts.trim() || undefined,
        },
      }).unwrap();
      notify.success('Incident resolved');
      setResolveOpen(false);
      setRootCause('');
      setResolutionNotes('');
      setCorrectiveAction('');
      setSpareParts('');
    } catch (err) {
      notify.error('Resolve failed', getApiErrorMessage(err as FetchBaseQueryError));
    }
  }

  function renderMeta(detail: IncidentDetail): JSX.Element {
    return (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Detail
          label="Camera"
          value={
            detail.camera ? `${detail.camera.cameraCode} · ${detail.camera.name}` : 'Site-level'
          }
        />
        <Detail label="Site / zone" value={`${detail.site.name} · ${detail.zone.name}`} />
        <Detail label="First detected" value={timeAgo(detail.firstDetectedAt)} />
        <Detail label="Last detected" value={timeAgo(detail.lastDetectedAt)} />
        <Detail
          label="Acknowledged"
          value={detail.acknowledgedAt ? timeAgo(detail.acknowledgedAt) : undefined}
        />
        <Detail label="Assigned to" value={detail.assignedTo?.email} />
        <Detail
          label="Downtime"
          value={
            detail.downtimeSeconds != null ? formatDowntime(detail.downtimeSeconds) : undefined
          }
        />
        <Detail label="SLA impact" value={detail.slaImpact ? 'Yes' : 'No'} />
      </dl>
    );
  }

  return (
    <Drawer
      open={incidentId !== null}
      onClose={onClose}
      title={
        incident ? (
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h2 className="truncate font-heading text-lg font-semibold text-ink">
                {incident.incidentNumber}
              </h2>
              <SeverityBadge severity={incident.severity} />
              <IncidentStatusChip status={incident.status} />
            </div>
            <p className="mt-0.5 truncate text-xs text-muted">{prettyEnum(incident.type)}</p>
          </div>
        ) : (
          <Skeleton variant="line" width="50%" />
        )
      }
    >
      {error ? (
        <div className="rounded-card bg-card p-8 text-center shadow-soft">
          <p className="text-sm text-muted">{getApiErrorMessage(error)}</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : isLoading || !incident ? (
        <div className="space-y-4">
          <Skeleton height={72} />
          <Skeleton height={140} />
          <Skeleton height={180} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Actions — mirror incident.router.ts guards */}
          {(canOperate || isAdmin) && (
            <section className="flex flex-wrap items-center gap-2">
              {canOperate && canAck && (
                <Button
                  size="sm"
                  loading={acking}
                  leftIcon={<Check size={14} />}
                  onClick={() => id && run(() => ack(id).unwrap(), 'Incident acknowledged')}
                >
                  Acknowledge
                </Button>
              )}
              {canOperate && canInvestigate && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={investigating}
                  leftIcon={<Search size={14} />}
                  onClick={() => id && run(() => investigate(id).unwrap(), 'Marked investigating')}
                >
                  Investigate
                </Button>
              )}
              {canOperate && isOpen && user && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={assigning}
                  leftIcon={<UserPlus size={14} />}
                  onClick={() =>
                    id &&
                    run(() => assign({ id, assignedToId: user.id }).unwrap(), 'Assigned to you')
                  }
                >
                  Assign to me
                </Button>
              )}
              {canOperate && isOpen && (
                <Button
                  size="sm"
                  variant={resolveOpen ? 'outline' : 'secondary'}
                  leftIcon={<Wrench size={14} />}
                  onClick={() => setResolveOpen((open) => !open)}
                >
                  Resolve…
                </Button>
              )}
              {isAdmin && canClose && (
                <Button
                  size="sm"
                  variant="danger"
                  loading={closing}
                  leftIcon={<Archive size={14} />}
                  onClick={() => id && run(() => close(id).unwrap(), 'Incident closed')}
                >
                  Close
                </Button>
              )}
            </section>
          )}

          {/* Admin assign picker */}
          {isAdmin && isOpen && users && users.items.length > 0 && (
            <section className="flex items-center gap-2">
              <select
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
                aria-label="Choose assignee"
                className="h-9 min-w-0 flex-1 rounded-lg border border-hairline bg-card px-3 text-sm text-ink focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage"
              >
                <option value="">Assign to…</option>
                {users.items.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name || candidate.email}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="secondary"
                disabled={!assigneeId}
                loading={assigning}
                onClick={() =>
                  id &&
                  assigneeId &&
                  run(() => assign({ id, assignedToId: assigneeId }).unwrap(), 'Incident assigned')
                }
              >
                Assign
              </Button>
            </section>
          )}

          {/* Resolve form */}
          {resolveOpen && canOperate && isOpen && (
            <section className="space-y-3 rounded-tile bg-card p-4 shadow-soft">
              <Input
                label="Root cause"
                value={rootCause}
                onChange={(event) => setRootCause(event.target.value)}
                placeholder="What actually failed?"
              />
              <div className="w-full space-y-1.5">
                <label
                  htmlFor="resolution-notes"
                  className="block text-sm font-medium text-muted"
                >
                  Resolution notes
                </label>
                <textarea
                  id="resolution-notes"
                  rows={3}
                  value={resolutionNotes}
                  onChange={(event) => setResolutionNotes(event.target.value)}
                  placeholder="What was done to fix it?"
                  className={textareaClass}
                />
              </div>
              <Input
                label="Corrective action (optional)"
                value={correctiveAction}
                onChange={(event) => setCorrectiveAction(event.target.value)}
              />
              <Input
                label="Spare parts used (optional)"
                value={spareParts}
                onChange={(event) => setSpareParts(event.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setResolveOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" loading={resolving} onClick={handleResolve}>
                  Resolve incident
                </Button>
              </div>
            </section>
          )}

          {/* Evidence */}
          <section>
            <h3 className="text-sm font-semibold text-ink">Evidence</h3>
            <div className="mt-3 flex gap-3">
              <EvidenceTile
                label="Before (last healthy)"
                evidence={incident.previousSnapshot}
                imageUrl={urlFor(incident.previousSnapshot)}
              />
              <EvidenceTile
                label="At fault"
                evidence={incident.faultSnapshot}
                imageUrl={urlFor(incident.faultSnapshot)}
              />
            </div>
          </section>

          {/* Meta */}
          <section>
            <h3 className="text-sm font-semibold text-ink">Details</h3>
            <div className="mt-3">{renderMeta(incident)}</div>
          </section>

          {/* Resolution */}
          {incident.rootCause && (
            <section className="rounded-tile bg-state-healthy-soft p-4">
              <h3 className="text-sm font-semibold text-state-healthy">Resolution</h3>
              <dl className="mt-2 space-y-2">
                <Detail label="Root cause" value={incident.rootCause} />
                <Detail label="Notes" value={incident.resolutionNotes ?? undefined} />
                {incident.correctiveAction && (
                  <Detail label="Corrective action" value={incident.correctiveAction} />
                )}
                {incident.spareParts && <Detail label="Spare parts" value={incident.spareParts} />}
              </dl>
            </section>
          )}

          {/* Timeline (append-only IncidentEvent rows, oldest first) */}
          <section>
            <h3 className="text-sm font-semibold text-ink">Timeline</h3>
            <ol className="mt-3 space-y-0">
              {incident.events.map((event, index) => (
                <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {index < incident.events.length - 1 && (
                    <span
                      className="absolute left-[5px] top-4 h-full w-px bg-hairline"
                      aria-hidden
                    />
                  )}
                  <span
                    className={cn(
                      'relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-card',
                      event.actor === 'system' ? 'bg-hairline' : 'bg-sage'
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{prettyEnum(event.event)}</p>
                    <p className="text-xs text-muted">
                      {event.actor === 'system' || !event.actor ? 'System' : event.actor} ·{' '}
                      {timeAgo(event.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* Alert deliveries */}
          {incident.notifications.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-ink">
                Alerts ({incident.notifications.length})
              </h3>
              <ul className="mt-3 space-y-1.5">
                {incident.notifications.slice(0, 5).map((notification) => (
                  <li
                    key={notification.id}
                    className="flex items-center gap-2.5 rounded-lg bg-card px-3 py-2 text-xs shadow-soft"
                  >
                    <span className="font-medium text-ink">{prettyEnum(notification.channel)}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">
                      {notification.recipient}
                    </span>
                    <span className="shrink-0 text-muted">
                      {prettyEnum(notification.status)} · {timeAgo(notification.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}
