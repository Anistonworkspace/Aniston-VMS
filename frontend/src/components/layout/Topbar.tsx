import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Bell, ChevronDown, LogOut, Search } from 'lucide-react';
import { AnimatedPopover, Skeleton } from '@/components/ui';
import {
  useGetHealthSummaryQuery,
  useListRecentIncidentsQuery,
} from '@/features/overview/overview.api';
// Real auth (not the overview mock's CurrentUser) — see
// .claude/skills/skill-auth-patterns.md.
import { useGetCurrentUserQuery, useLogoutMutation } from '@/features/auth/auth.api';
import { ROLE_LABELS } from '@/features/auth/auth.types';
import { getApiErrorMessage } from '@/lib/apiError';

// Topbar — docs/04-uiux-brief.md §5: page title + coral critical pill,
// centered search, bell (unread dot), account menu (avatar → sign-out
// dropdown), sage primary CTA (Dashboard → "Open Live Wall").
const ICON_BUTTON =
  'grid h-11 w-11 place-items-center rounded-control border border-hairline bg-card text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage';

export function Topbar(): JSX.Element {
  const navigate = useNavigate();
  const { data: health, isLoading } = useGetHealthSummaryQuery();
  const { data: incidents } = useListRecentIncidentsQuery();
  const { data: user } = useGetCurrentUserQuery();
  const [logout, { isLoading: loggingOut }] = useLogoutMutation();

  const critical = health?.critical ?? 0;
  const hasUnread = (incidents?.filter((i) => i.status === 'OPEN').length ?? 0) > 0;
  const initials =
    user?.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') ?? '';

  async function handleLogout(): Promise<void> {
    try {
      await logout().unwrap();
    } catch (err) {
      // Backend invalidation failed (e.g. network blip) — the local
      // credentials are cleared in the `finally` of the mutation regardless,
      // so still route to /login rather than stranding the user.
      toast.error(getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0]));
    } finally {
      navigate('/login', { replace: true });
    }
  }

  return (
    <header className="flex items-center gap-4 px-6 pb-2 pt-6 lg:px-8">
      <div className="flex shrink-0 items-center gap-3">
        <h1 className="font-heading text-xl font-semibold text-ink">Overview</h1>
        {isLoading ? (
          <Skeleton width={76} height={24} className="rounded-full" />
        ) : critical > 0 ? (
          <span className="flex items-center gap-1.5 rounded-full bg-coral px-2.5 py-1 text-xs font-semibold text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-white/90" aria-hidden />
            {critical} Critical
          </span>
        ) : null}
      </div>

      <div className="hidden flex-1 justify-center px-2 md:flex">
        <div className="relative w-full max-w-sm">
          <Search
            size={18}
            strokeWidth={1.5}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            aria-label="Search cameras, sites, incidents"
            placeholder="Search cameras, sites, incidents…"
            className="h-11 w-full rounded-control border border-hairline bg-card pl-10 pr-4 text-sm text-ink placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          />
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2.5 md:ml-0">
        <button type="button" aria-label="Notifications" className={`relative ${ICON_BUTTON}`}>
          <Bell size={18} strokeWidth={1.5} />
          {hasUnread && (
            <span
              className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-coral"
              aria-hidden
            />
          )}
        </button>
        <AnimatedPopover
          placement="bottom-end"
          className="w-52 p-1.5"
          trigger={
            <button
              type="button"
              aria-label="Account menu"
              className="flex h-11 items-center gap-2.5 rounded-control border border-hairline bg-card pl-1.5 pr-2.5 text-left transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            >
              {user ? (
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-soft font-heading text-xs font-semibold text-indigo">
                  {initials}
                </span>
              ) : (
                <Skeleton variant="circle" width={32} height={32} />
              )}
              <span className="hidden min-w-0 flex-col leading-tight sm:flex">
                <span className="truncate text-sm font-medium text-ink">{user?.name ?? '…'}</span>
                <span className="truncate text-xs text-muted">
                  {user ? ROLE_LABELS[user.role] : 'Loading'}
                </span>
              </span>
              <ChevronDown size={16} strokeWidth={1.5} className="shrink-0 text-muted" />
            </button>
          }
        >
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-sm font-medium text-ink transition-colors duration-150 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage disabled:pointer-events-none disabled:opacity-50"
          >
            <LogOut size={16} strokeWidth={1.5} />
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </AnimatedPopover>
        <button
          type="button"
          className="h-11 rounded-control bg-sage px-5 text-sm font-medium text-white transition-colors duration-150 hover:bg-sage-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2"
        >
          Open Live Wall
        </button>
      </div>
    </header>
  );
}
