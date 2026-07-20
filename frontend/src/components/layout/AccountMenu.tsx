import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronDown, LogOut } from 'lucide-react';
import { AnimatedPopover, Skeleton } from '@/components/ui';
import { useGetCurrentUserQuery, useLogoutMutation } from '@/features/auth/auth.api';
import { ROLE_LABELS } from '@/features/auth/auth.types';
import { getApiErrorMessage } from '@/lib/apiError';

// Account menu — CR-1 (docs/04-uiux-brief.md §4): the profile block lives in
// the sidebar on every page; the Topbar carries no profile chip. Avatar + name
// + role trigger opens a sign-out popover (upward, since it sits at the bottom
// of the dark sidebar).
export function AccountMenu(): JSX.Element {
  const navigate = useNavigate();
  const { data: user } = useGetCurrentUserQuery();
  const [logout, { isLoading: loggingOut }] = useLogoutMutation();

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
      // Backend invalidation failed (e.g. network blip) — the local credentials
      // are cleared in the `finally` of the mutation regardless, so still route
      // to /login rather than stranding the user.
      toast.error(getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0]));
    } finally {
      navigate('/login', { replace: true });
    }
  }

  return (
    <AnimatedPopover
      placement="top-start"
      className="w-52 p-1.5"
      trigger={
        <button
          type="button"
          aria-label="Account menu"
          className="flex w-full items-center gap-2.5 rounded-control border border-white/10 bg-white/5 px-2 py-2 text-left transition-colors duration-150 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
        >
          {user ? (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-soft font-heading text-xs font-semibold text-indigo">
              {initials}
            </span>
          ) : (
            <Skeleton variant="circle" width={32} height={32} />
          )}
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-sm font-medium text-sidebar-text">
              {user?.name ?? '…'}
            </span>
            <span className="truncate text-xs text-sidebar-muted">
              {user ? ROLE_LABELS[user.role] : 'Loading'}
            </span>
          </span>
          <ChevronDown size={16} strokeWidth={1.5} className="shrink-0 text-sidebar-muted" />
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
  );
}
