import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell } from 'lucide-react';
import { Badge } from '@/components/ui';
import { prettyEnum } from '@/lib/prettyEnum';
import { scalePopDown } from '@/lib/animations';
import { timeAgo } from '@/features/overview/timeAgo';
import {
  useGetNotificationFeedQuery,
  useGetNotificationUnreadCountQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  type NotificationItem,
} from '@/features/notifications/notifications.api';
import type { IncidentSummary } from '@/types/vms';

const ICON_BUTTON =
  'grid h-9 w-9 place-items-center rounded-control border border-hairline bg-card text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage';

// IncidentSummary severity (CRITICAL | WARNING | MAINTENANCE) → Badge tint. This
// feed uses the vms IncidentSummary union, which — unlike the incidents.types
// 3-tier severity behind SeverityBadge — carries MAINTENANCE (not INFO), so we
// map locally. MAINTENANCE reuses the maintenance/info token (matches
// ActivityListCard) rather than falling through to the grey default variant.
const SEVERITY_VARIANT: Record<IncidentSummary['severity'], 'danger' | 'warning' | 'info'> = {
  CRITICAL: 'danger',
  WARNING: 'warning',
  MAINTENANCE: 'info',
};

// NotificationBell — Topbar alert bell (docs/04-uiux-brief.md §5). Now backed by
// GENUINE per-user read state: the badge count comes from GET
// /api/notifications/me/unread-count and the dropdown feed from GET
// /api/notifications/me, each item carrying this user's `isRead` flag (backend
// IncidentReadReceipt table, scope-filtered server-side). Opening an item marks
// just that incident read; "Mark all read" clears the rest — both optimistic
// with rollback (features/notifications/notifications.api.ts). The badge is a
// true count (capped "99+") that can exceed the capped feed list.
export function NotificationBell(): JSX.Element {
  const navigate = useNavigate();
  const {
    data: feed,
    isLoading: feedLoading,
    isError: feedError,
    refetch: refetchFeed,
  } = useGetNotificationFeedQuery();
  const { data: unread } = useGetNotificationUnreadCountQuery();
  const [markRead] = useMarkNotificationReadMutation();
  const [markAll, { isLoading: markingAll }] = useMarkAllNotificationsReadMutation();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const items = feed ?? [];
  const unreadCount = unread?.count ?? 0;
  const hasUnread = unreadCount > 0;
  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  // Dismiss on outside click / Escape — mirrors AnimatedPopover, but kept local
  // so selecting an item can close the panel before it deep-links (otherwise the
  // dropdown would linger over the incident drawer).
  useEffect(() => {
    if (!open) return undefined;
    function onPointer(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Open one incident: mark it read (optimistic; no-op if already read), close
  // the panel, then deep-link to /incidents/:id (AppRouter mounts the drawer).
  function openIncident(incident: NotificationItem): void {
    if (!incident.isRead) markRead(incident.id);
    setOpen(false);
    navigate(`/incidents/${incident.id}`);
  }

  function viewAll(): void {
    setOpen(false);
    navigate('/incidents');
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={hasUnread ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`relative ${ICON_BUTTON}`}
      >
        <Bell size={18} strokeWidth={1.5} />
        {hasUnread && (
          <span
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-coral px-1 text-[10px] font-semibold leading-none text-white tabular-nums"
            aria-hidden
          >
            {badgeLabel}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="notif-panel"
            role="menu"
            aria-label="Recent incidents"
            variants={scalePopDown}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-hairline bg-card shadow-soft"
          >
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
              <span className="font-heading text-sm font-semibold text-ink">Notifications</span>
              <button
                type="button"
                onClick={() => markAll()}
                disabled={!hasUnread || markingAll}
                className="text-xs font-semibold text-sage transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage disabled:cursor-default disabled:text-muted disabled:no-underline"
              >
                Mark all read
              </button>
            </div>

            {feedLoading ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Loading…</p>
            ) : feedError ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-muted">Couldn’t load notifications.</p>
                <button
                  type="button"
                  onClick={() => refetchFeed()}
                  className="mt-2 text-xs font-semibold text-sage transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                >
                  Try again
                </button>
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">No new notifications.</p>
            ) : (
              <ul className="max-h-96 overflow-y-auto">
                {items.map((incident) => (
                  <li key={incident.id}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => openIncident(incident)}
                      className={`flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sage ${
                        incident.isRead ? '' : 'bg-sage/5'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          {!incident.isRead && (
                            <span
                              className="h-2 w-2 shrink-0 rounded-full bg-coral"
                              aria-label="Unread"
                            />
                          )}
                          <span
                            className={`truncate text-sm tabular-nums ${
                              incident.isRead ? 'font-medium text-muted' : 'font-semibold text-ink'
                            }`}
                          >
                            {incident.code}
                          </span>
                        </span>
                        <Badge variant={SEVERITY_VARIANT[incident.severity]} size="sm" dot>
                          {prettyEnum(incident.severity)}
                        </Badge>
                      </span>
                      <span
                        className={`truncate text-sm ${incident.isRead ? 'text-muted' : 'text-ink'}`}
                      >
                        {incident.title}
                      </span>
                      <span className="flex items-center justify-between gap-2 text-xs text-muted">
                        <span className="truncate">
                          {incident.cameraLabel} · {incident.zoneName}
                        </span>
                        <span className="shrink-0">{timeAgo(incident.occurredAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              onClick={viewAll}
              className="block w-full border-t border-hairline px-4 py-2.5 text-center text-sm font-medium text-sage transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sage"
            >
              View all incidents
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
