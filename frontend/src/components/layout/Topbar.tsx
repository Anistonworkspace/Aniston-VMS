import { Bell, Search } from 'lucide-react';
import { Skeleton } from '@/components/ui';
import {
  useGetHealthSummaryQuery,
  useListRecentIncidentsQuery,
} from '@/features/overview/overview.api';

// Topbar — docs/04-uiux-brief.md §5: page title + coral critical pill,
// centered search, bell (unread dot), account menu (avatar → sign-out
// dropdown), sage primary CTA (Dashboard → "Open Live Wall").
const ICON_BUTTON =
  'grid h-11 w-11 place-items-center rounded-control border border-hairline bg-card text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage';

export function Topbar(): JSX.Element {
  const { data: health, isLoading } = useGetHealthSummaryQuery();
  const { data: incidents } = useListRecentIncidentsQuery();

  const critical = health?.critical ?? 0;
  const hasUnread = (incidents?.filter((i) => i.status === 'OPEN').length ?? 0) > 0;

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
