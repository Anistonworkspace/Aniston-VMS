import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, SkeletonTable } from '@/components/ui';
import { Select } from './Select';
import { formatDateTime } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/apiError';
import { useListAdminNotificationsQuery } from './admin.api';
import {
  ALERT_CHANNELS,
  NOTIFICATION_STATUSES,
  type AlertChannel,
  type AlertSeverity,
  type NotificationStatus,
} from './admin.types';

const STATUS_BADGE: Record<
  NotificationStatus,
  'default' | 'info' | 'primary' | 'success' | 'warning' | 'danger'
> = {
  QUEUED: 'default',
  ACCEPTED: 'info',
  SENT: 'primary',
  DELIVERED: 'success',
  READ: 'success',
  BOUNCED: 'warning',
  FAILED: 'danger',
};

const SEVERITY_BADGE: Record<AlertSeverity, 'info' | 'warning' | 'danger'> = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'danger',
};

/**
 * Read-only outbound alert delivery log (GET /notifications). Any authenticated
 * role — the backend filters rows through the caller's access scopes.
 */
export function NotificationsTab(): JSX.Element {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');

  const query = useMemo(
    () => ({
      page,
      limit: 20,
      ...(status ? { status: status as NotificationStatus } : {}),
      ...(channel ? { channel: channel as AlertChannel } : {}),
    }),
    [page, status, channel]
  );
  const { data, isLoading, isError, error, refetch } = useListAdminNotificationsQuery(query);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Notification delivery log</h2>
          <p className="text-sm text-muted">
            Outbound incident alerts — rows are filtered by your access scopes.
          </p>
        </div>
        <div className="ml-auto flex items-end gap-3">
          <div className="w-40">
            <Select
              label="Status"
              options={[
                { value: '', label: 'All statuses' },
                ...NOTIFICATION_STATUSES.map((value) => ({ value, label: value })),
              ]}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-36">
            <Select
              label="Channel"
              options={[
                { value: '', label: 'All' },
                ...ALERT_CHANNELS.map((value) => ({ value, label: value })),
              ]}
              value={channel}
              onChange={(event) => {
                setChannel(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="rounded-card bg-card p-4 shadow-soft">
          <SkeletonTable rows={6} />
        </div>
      )}
      {isError && (
        <div className="rounded-card bg-card p-10 text-center shadow-soft">
          <p className="text-sm text-secondary">{getApiErrorMessage(error)}</p>
          <Button
            className="mt-4"
            variant="secondary"
            size="sm"
            onClick={() => {
              void refetch();
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {data && (
        <div className="overflow-x-auto rounded-card bg-card shadow-soft">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-hairline text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Incident</th>
                <th className="px-4 py-3 font-medium">Channel</th>
                <th className="px-4 py-3 font-medium">Recipient</th>
                <th className="px-4 py-3 font-medium">Template</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Sent</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">
                    No notifications match the current filters.
                  </td>
                </tr>
              )}
              {data.items.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-hairline transition-colors last:border-b-0 hover:bg-surface"
                >
                  <td className="px-4 py-3 whitespace-nowrap text-secondary">
                    {formatDateTime(row.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/incidents/${row.incident.id}`}
                      className="font-medium text-indigo hover:underline"
                    >
                      {row.incident.incidentNumber}
                    </Link>
                    <Badge
                      variant={SEVERITY_BADGE[row.incident.severity]}
                      size="sm"
                      className="ml-2"
                    >
                      {row.incident.severity}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-secondary">{row.channel}</td>
                  <td className="px-4 py-3 text-secondary">{row.recipient}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{row.templateName}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_BADGE[row.status]} size="sm">
                      {row.status}
                    </Badge>
                    {row.attemptCount > 1 && (
                      <span className="ml-1.5 text-xs text-muted">×{row.attemptCount}</span>
                    )}
                    {row.failureReason && (
                      <p
                        className="mt-0.5 max-w-[220px] truncate text-xs text-coral"
                        title={row.failureReason}
                      >
                        {row.failureReason}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-secondary">
                    {row.sentAt ? formatDateTime(row.sentAt) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <p className="text-xs text-muted">
                Page {data.page} of {totalPages} · {data.total} notifications
              </p>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
