import { Fragment, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge, Button, Input, SkeletonTable } from '@/components/ui';
import { cn, formatDateTime } from '@/lib/utils';
import { Select } from './Select';
import { getApiErrorMessage } from '@/lib/apiError';
import { useGetCurrentUserQuery } from '@/features/auth/auth.api';
import { useListAuditLogQuery, useListUsersQuery } from './admin.api';
import { canReadUsers } from './admin.types';

function toIso(local: string): string | undefined {
  if (!local) return undefined;
  const parsed = new Date(local);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/**
 * Append-only compliance trail (GET /audit-log — SUPER_ADMIN/AUDITOR).
 * AUDITOR cannot call GET /users, so the user filter degrades to a raw
 * UUID input for that role.
 */
export function AuditLogTab(): JSX.Element {
  const { data: me } = useGetCurrentUserQuery();
  const canPickUser = canReadUsers(me?.role);

  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [userId, setUserId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: usersData } = useListUsersQuery({ limit: 100 }, { skip: !canPickUser });

  const query = useMemo(
    () => ({
      page,
      limit: 25,
      ...(action.trim() ? { action: action.trim() } : {}),
      ...(entityType.trim() ? { entityType: entityType.trim() } : {}),
      ...(entityId.trim() ? { entityId: entityId.trim() } : {}),
      ...(userId.trim() ? { userId: userId.trim() } : {}),
      ...(toIso(start) ? { startDate: toIso(start) } : {}),
      ...(toIso(end) ? { endDate: toIso(end) } : {}),
    }),
    [page, action, entityType, entityId, userId, start, end]
  );
  const { data, isLoading, isError, error, refetch } = useListAuditLogQuery(query);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const resetPage = (): void => setPage(1);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Audit log</h2>
        <p className="text-sm text-muted">
          Append-only cross-zone compliance trail — expand a row to inspect the value diff.
        </p>
      </div>

      <div className="grid gap-3 rounded-card bg-card p-4 shadow-soft sm:grid-cols-2 lg:grid-cols-3">
        <Input
          label="Action"
          placeholder='e.g. "user.update"'
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            resetPage();
          }}
        />
        <Input
          label="Entity type"
          placeholder='e.g. "camera"'
          value={entityType}
          onChange={(event) => {
            setEntityType(event.target.value);
            resetPage();
          }}
        />
        <Input
          label="Entity id"
          placeholder="UUID or key"
          value={entityId}
          onChange={(event) => {
            setEntityId(event.target.value);
            resetPage();
          }}
        />
        {canPickUser ? (
          <Select
            label="User"
            options={[
              { value: '', label: 'All users' },
              ...(usersData?.items ?? []).map((user) => ({
                value: user.id,
                label: `${user.name} (${user.email})`,
              })),
            ]}
            value={userId}
            onChange={(event) => {
              setUserId(event.target.value);
              resetPage();
            }}
          />
        ) : (
          <Input
            label="User id"
            placeholder="UUID"
            value={userId}
            onChange={(event) => {
              setUserId(event.target.value);
              resetPage();
            }}
            hint="Your role cannot list users — paste a user UUID."
          />
        )}
        <Input
          label="From"
          type="datetime-local"
          value={start}
          onChange={(event) => {
            setStart(event.target.value);
            resetPage();
          }}
        />
        <Input
          label="To"
          type="datetime-local"
          value={end}
          onChange={(event) => {
            setEnd(event.target.value);
            resetPage();
          }}
        />
      </div>

      {isLoading && (
        <div className="rounded-card bg-card p-4 shadow-soft">
          <SkeletonTable rows={8} />
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
                <th className="w-10 px-2 py-3" />
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Entity</th>
                <th className="px-4 py-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                    No audit events match the current filters.
                  </td>
                </tr>
              )}
              {data.items.map((row) => (
                <Fragment key={row.id}>
                  <tr className="border-b border-hairline transition-colors last:border-b-0 hover:bg-surface">
                    <td className="px-2 py-3">
                      <button
                        type="button"
                        aria-label={expandedId === row.id ? 'Collapse details' : 'Expand details'}
                        onClick={() =>
                          setExpandedId((current) => (current === row.id ? null : row.id))
                        }
                        className="grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-secondary"
                      >
                        <ChevronDown
                          size={15}
                          className={cn(
                            'transition-transform duration-150',
                            expandedId === row.id && 'rotate-180'
                          )}
                        />
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-secondary">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {row.user ? (
                        <>
                          <p className="font-medium text-ink">{row.user.name}</p>
                          <p className="text-xs text-muted">{row.user.email}</p>
                        </>
                      ) : (
                        <span className="text-muted">System</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-secondary">{row.action}</td>
                    <td className="px-4 py-3">
                      <Badge variant="default" size="sm">
                        {row.entityType}
                      </Badge>
                      <span
                        className="ml-2 inline-block max-w-[160px] truncate align-middle font-mono text-xs text-muted"
                        title={row.entityId}
                      >
                        {row.entityId}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted">
                      {row.ipAddress}
                    </td>
                  </tr>
                  {expandedId === row.id && (
                    <tr key={`${row.id}-detail`} className="bg-surface">
                      <td colSpan={6} className="px-6 py-4">
                        {row.oldValue == null && row.newValue == null ? (
                          <p className="text-xs text-muted">
                            No value diff was recorded for this event.
                          </p>
                        ) : (
                          <div className="grid gap-3 md:grid-cols-2">
                            {row.oldValue != null && (
                              <div>
                                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                                  Old value
                                </p>
                                <pre className="max-h-56 overflow-auto rounded-lg bg-charcoal p-3 text-xs text-white">
                                  {JSON.stringify(row.oldValue, null, 2)}
                                </pre>
                              </div>
                            )}
                            {row.newValue != null && (
                              <div>
                                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                                  New value
                                </p>
                                <pre className="max-h-56 overflow-auto rounded-lg bg-charcoal p-3 text-xs text-white">
                                  {JSON.stringify(row.newValue, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
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
                Page {data.page} of {totalPages} · {data.total} events
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
