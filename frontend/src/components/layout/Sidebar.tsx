import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Cctv,
  ChevronDown,
  FileText,
  Film,
  HeartPulse,
  LayoutDashboard,
  Layers,
  MonitorPlay,
  Plus,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui';
import {
  useGetCurrentUserQuery,
  useGetHealthSummaryQuery,
  useListRecentIncidentsQuery,
  useListZonesQuery,
} from '@/features/overview/overview.api';
import { canManageRegistry, type ZoneState } from '@/types/vms';

// Dark slate sidebar — docs/04-uiux-brief.md §4: logo, centered user block
// with status ring, nav with expandable Zones (health dots), bottom dashed
// "Add camera" card (admin) or platform-health chip.
const ITEM_BASE =
  'flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage';
const ITEM_INACTIVE = 'text-sidebar-muted hover:bg-white/5 hover:text-sidebar-text';

const ZONE_DOT: Record<ZoneState, string> = {
  healthy: 'bg-state-healthy',
  warning: 'bg-state-warning',
  critical: 'bg-state-critical',
  maintenance: 'bg-state-maintenance',
};

interface StubItemProps {
  icon: LucideIcon;
  label: string;
  pill?: number;
}

// Placeholder nav entries — routes land in later stages.
function StubItem({ icon: Icon, label, pill }: StubItemProps): JSX.Element {
  return (
    <button type="button" className={cn(ITEM_BASE, ITEM_INACTIVE)}>
      <Icon size={20} strokeWidth={1.5} />
      {label}
      {typeof pill === 'number' && pill > 0 && (
        <span className="ml-auto rounded-full bg-coral px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white">
          {pill}
        </span>
      )}
    </button>
  );
}

export function Sidebar(): JSX.Element {
  const [zonesOpen, setZonesOpen] = useState(true);
  const { data: user } = useGetCurrentUserQuery();
  const { data: zones, isLoading: zonesLoading } = useListZonesQuery();
  const { data: incidents } = useListRecentIncidentsQuery();
  const { data: health } = useGetHealthSummaryQuery();

  const isAdmin = user ? canManageRegistry(user.role) : false;
  const openIncidents = incidents?.filter((i) => i.status !== 'RESOLVED').length ?? 0;
  const platformHealthy = (health?.critical ?? 0) === 0;
  const initials =
    user?.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') ?? '';

  return (
    <aside className="hidden w-[260px] shrink-0 flex-col bg-sidebar lg:flex">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-6 pt-7">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-sage">
          <Cctv size={16} strokeWidth={1.5} className="text-white" />
        </span>
        <span className="font-heading text-md font-semibold text-white">Aniston VMS</span>
      </div>

      {/* User block */}
      <div className="mt-8 flex flex-col items-center gap-2 px-6 text-center">
        {user ? (
          <span
            className={cn(
              'grid h-16 w-16 place-items-center rounded-full bg-indigo-soft font-heading text-lg font-semibold text-indigo ring-2 ring-offset-2 ring-offset-sidebar',
              platformHealthy ? 'ring-state-healthy' : 'ring-state-critical'
            )}
          >
            {initials}
          </span>
        ) : (
          <Skeleton variant="circle" width={64} height={64} className="bg-white/10" />
        )}
        <p className="text-sm font-medium text-sidebar-text">{user?.name ?? '…'}</p>
        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] text-sidebar-muted">
          {user?.roleLabel ?? 'Loading'}
        </span>
      </div>

      {/* Nav */}
      <nav className="mt-8 flex-1 space-y-1 overflow-y-auto px-4 pb-4" aria-label="Primary">
        <NavLink
          to="/"
          className={({ isActive }) =>
            cn(ITEM_BASE, isActive ? 'bg-white/10 text-white' : ITEM_INACTIVE)
          }
        >
          <LayoutDashboard size={20} strokeWidth={1.5} />
          Dashboard
        </NavLink>
        <StubItem icon={MonitorPlay} label="Live Wall" />
        <StubItem icon={Cctv} label="Cameras" />
        <StubItem icon={AlertTriangle} label="Incidents" pill={openIncidents} />

        <button
          type="button"
          onClick={() => setZonesOpen((open) => !open)}
          aria-expanded={zonesOpen}
          className={cn(ITEM_BASE, ITEM_INACTIVE)}
        >
          <Layers size={20} strokeWidth={1.5} />
          Zones
          <ChevronDown
            size={16}
            strokeWidth={1.5}
            className={cn('ml-auto transition-transform duration-150', zonesOpen && 'rotate-180')}
          />
        </button>
        {zonesOpen && (
          <ul className="space-y-0.5 pl-4">
            {zonesLoading &&
              [0, 1, 2].map((i) => (
                <li key={i} className="px-3 py-1.5">
                  <Skeleton variant="line" width="70%" height={10} className="bg-white/10" />
                </li>
              ))}
            {zones?.map((zone) => (
              <li key={zone.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-control px-3 py-1.5 text-sm text-sidebar-muted transition-colors duration-150 hover:bg-white/5 hover:text-sidebar-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                >
                  <span
                    className={cn('h-2 w-2 shrink-0 rounded-full', ZONE_DOT[zone.state])}
                    aria-hidden
                  />
                  <span className="truncate">{zone.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <StubItem icon={BarChart3} label="Analytics" />
        <StubItem icon={Film} label="Clips" />
        <StubItem icon={FileText} label="Reports" />
        {isAdmin && <StubItem icon={ShieldCheck} label="Admin" />}
        <StubItem icon={Settings} label="Settings" />
      </nav>

      {/* Bottom card — dashed "Add camera" (admin) or platform-health chip */}
      <div className="px-4 pb-6">
        {isAdmin ? (
          <div className="rounded-tile border border-dashed border-white/25 bg-white/5 p-4 text-center">
            <p className="text-sm font-medium text-sidebar-text">Add camera</p>
            <p className="mt-0.5 text-xs text-sidebar-muted">Register a new device</p>
            <button
              type="button"
              aria-label="Add camera"
              className="mx-auto mt-3 grid h-10 w-10 place-items-center rounded-full bg-card text-ink shadow-soft transition-shadow duration-150 hover:shadow-soft-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            >
              <Plus size={18} strokeWidth={1.5} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-tile bg-white/10 p-3 text-xs text-sidebar-muted">
            <HeartPulse
              size={16}
              strokeWidth={1.5}
              className={platformHealthy ? 'text-state-healthy' : 'text-state-critical'}
            />
            {platformHealthy ? 'Platform Healthy · heartbeat 20 s' : 'Critical incidents open'}
          </div>
        )}
      </div>
    </aside>
  );
}
