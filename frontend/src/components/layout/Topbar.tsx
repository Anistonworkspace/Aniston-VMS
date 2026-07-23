import { useNavigate } from 'react-router-dom';
import { PanelLeftOpen, Search } from 'lucide-react';
import { Skeleton } from '@/components/ui';
import { useGetHealthSummaryQuery } from '@/features/overview/overview.api';
import { NotificationBell } from './NotificationBell';

interface TopbarProps {
  /** Whether the desktop sidebar is currently collapsed to its icon rail. */
  collapsed: boolean;
  /** Expand the desktop sidebar back to full width (shown only while collapsed). */
  onExpand: () => void;
}

// Topbar — docs/04-uiux-brief.md §5: sidebar toggle + page title + coral
// critical pill, centered search, bell (unread dot + dropdown), account menu
// (avatar → sign-out dropdown), sage primary CTA (Dashboard → "Open Live Wall").
export function Topbar({ collapsed, onExpand }: TopbarProps): JSX.Element {
  const navigate = useNavigate();
  const { data: health, isLoading } = useGetHealthSummaryQuery();

  const critical = health?.critical ?? 0;

  return (
    <header className="flex items-center gap-3 px-4 pb-1.5 pt-2 lg:px-6">
      {/* Sidebar expand toggle — desktop only, shown only while the sidebar is
          collapsed. The expanded sidebar carries its own collapse control in its header. */}
      {collapsed && (
        <button
          type="button"
          onClick={onExpand}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-control text-muted transition-colors duration-150 hover:bg-card hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage lg:inline-flex"
        >
          <PanelLeftOpen size={20} strokeWidth={1.5} />
        </button>
      )}
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

      <div className="-mt-0.5 hidden flex-1 justify-center px-2 md:flex">
        <div className="relative w-full max-w-xs">
          <Search
            size={18}
            strokeWidth={1.5}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            aria-label="Search cameras, sites, incidents"
            placeholder="Search cameras, sites, incidents…"
            className="h-9 w-full rounded-control border border-hairline bg-card pl-10 pr-4 text-sm text-ink placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          />
        </div>
      </div>

      <div className="-mt-0.5 ml-auto flex shrink-0 items-center gap-2 md:ml-0">
        <NotificationBell />
        <button
          type="button"
          onClick={() => navigate('/live')}
          className="h-9 rounded-control bg-sage px-3.5 text-xs font-medium text-white transition-colors duration-150 hover:bg-sage-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2"
        >
          Open Live Wall
        </button>
      </div>
    </header>
  );
}
