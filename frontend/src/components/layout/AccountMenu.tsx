import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { LogOut } from 'lucide-react';
import { Skeleton } from '@/components/ui';
import { useGetCurrentUserQuery, useLogoutMutation } from '@/features/auth/auth.api';
import { ROLE_LABELS } from '@/features/auth/auth.types';
import { getApiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/utils';

interface AccountMenuProps {
  /** Collapsed sidebar rail — avatar-only identity + icon-only sign-out button. */
  collapsed?: boolean;
}

// Account menu — CR-1 (docs/04-uiux-brief.md §4): the profile block lives in
// the sidebar on every page; the Topbar carries no profile chip. The identity
// (avatar + name + role) sits above a direct Sign-out control. Both adapt to the
// collapsed rail like the nav icons: avatar/icon-only + tooltip when collapsed,
// full width + label when expanded — so nothing overflows the narrow rail.
export function AccountMenu({ collapsed = false }: AccountMenuProps): JSX.Element {
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
    <div className="space-y-1">
      {/* Identity — avatar + name/role. Collapsed: avatar only, centered. */}
      <div
        title={collapsed ? user?.name ?? 'Account' : undefined}
        className={cn(
          'flex w-full items-center rounded-control border border-hairline bg-sidebar-hover',
          collapsed ? 'justify-center p-1.5' : 'gap-2.5 px-2 py-2',
        )}
      >
        {user ? (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-soft font-heading text-xs font-semibold text-indigo">
            {initials}
          </span>
        ) : (
          <Skeleton variant="circle" width={32} height={32} />
        )}
        {!collapsed && (
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-sm font-medium text-sidebar-text">
              {user?.name ?? '…'}
            </span>
            <span className="truncate text-xs text-sidebar-muted">
              {user ? ROLE_LABELS[user.role] : 'Loading'}
            </span>
          </span>
        )}
      </div>

      {/* Sign out — direct control that adapts to the rail like the nav icons:
          icon-only square + tooltip when collapsed, icon + label when expanded.
          Stays fully inside the rail, so nothing is clipped by the main panel. */}
      <button
        type="button"
        onClick={handleLogout}
        disabled={loggingOut}
        aria-label="Sign out"
        title={collapsed ? 'Sign out' : undefined}
        className={cn(
          'flex w-full items-center rounded-control text-sm font-medium text-sidebar-muted transition-colors duration-150 hover:bg-sidebar-hover hover:text-sidebar-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage disabled:pointer-events-none disabled:opacity-50',
          collapsed ? 'justify-center px-0 py-1.5' : 'gap-2.5 px-3 py-2',
        )}
      >
        <LogOut size={18} strokeWidth={1.5} className="shrink-0" />
        {!collapsed && (
          <span className="truncate">{loggingOut ? 'Signing out…' : 'Sign out'}</span>
        )}
      </button>
    </div>
  );
}
