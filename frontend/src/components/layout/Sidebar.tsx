import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
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
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui';
import {
  useGetHealthSummaryQuery,
  useListRecentIncidentsQuery,
  useListZoneSummariesQuery,
} from '@/features/overview/overview.api';
import type { ZoneState } from '@/types/vms';
// Real auth (not the overview mock's CurrentUser) — see
// .claude/skills/skill-auth-patterns.md.
import { useGetCurrentUserQuery } from '@/features/auth/auth.api';
import { isAdminRole } from '@/features/auth/auth.types';
import { AccountMenu } from './AccountMenu';

// Dark slate sidebar — docs/04-uiux-brief.md §4: logo, nav with expandable
// Zones (health dots), bottom dashed
// (the account/user block now lives in the Topbar account menu)
// "Add camera" card (admin) or platform-health chip.
const ITEM_BASE =
  'flex w-full items-center gap-2.5 rounded-control px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage';
const ITEM_INACTIVE = 'text-sidebar-muted hover:bg-white/60 hover:text-sidebar-text';

const ZONE_DOT: Record<ZoneState, string> = {
  healthy: 'bg-state-healthy',
  warning: 'bg-state-warning',
  critical: 'bg-state-critical',
  maintenance: 'bg-state-maintenance',
};

export function Sidebar(): JSX.Element {
  const [zonesOpen, setZonesOpen] = useState(true);
  const { data: user } = useGetCurrentUserQuery();
  const { data: zones, isLoading: zonesLoading } = useListZoneSummariesQuery();
  const { data: incidents } = useListRecentIncidentsQuery();
  const { data: health } = useGetHealthSummaryQuery();

  const isAdmin = isAdminRole(user?.role);
  const openIncidents = incidents?.filter((i) => i.status !== 'RESOLVED').length ?? 0;
  const platformHealthy = (health?.critical ?? 0) === 0;

  return (
    <aside className="hidden h-full w-[260px] shrink-0 flex-col overflow-hidden bg-sidebar lg:flex">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-6 pt-7">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-sage">
          <Cctv size={16} strokeWidth={1.5} className="text-white" />
        </span>
        <span className="font-heading text-md font-semibold text-ink">Aniston VMS</span>
      </div>

      {/* Nav */}
      <nav
        className="no-scrollbar mt-7 flex-1 space-y-0.5 overflow-y-auto px-4 pb-4"
        aria-label="Primary"
      >
        <NavLink
          to="/"
          className={({ isActive }) =>
            cn(ITEM_BASE, isActive ? 'bg-white text-sage shadow-soft' : ITEM_INACTIVE)
          }
        >
          <LayoutDashboard size={18} strokeWidth={1.5} />
          Dashboard
        </NavLink>
        <NavLink
          to="/live"
          className={({ isActive }) =>
            cn(ITEM_BASE, isActive ? 'bg-white text-sage shadow-soft' : ITEM_INACTIVE)
          }
        >
          <MonitorPlay size={18} strokeWidth={1.5} />
          Live Wall
        </NavLink>
        <NavLink
          to="/cameras"
          className={({ isActive }) =>
            cn(ITEM_BASE, isActive ? 'bg-white text-sage shadow-soft' : ITEM_INACTIVE)
          }
        >
          <Cctv size={18} strokeWidth={1.5} />
          Cameras
        </NavLink>
        <NavLink
          to="/incidents"
          className={({ isActive }) =>
            cn(ITEM_BASE, isActive ? 'bg-white text-sage shadow-soft' : ITEM_INACTIVE)
          }
        >
          <AlertTriangle size={18} strokeWidth={1.5} />
          Incidents
          {openIncidents > 0 && (
            <span className="ml-auto rounded-full bg-coral px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white">
              {openIncidents}
            </span>
          )}
        </NavLink>

        <button
          type="button"
          onClick={() => setZonesOpen((open) => !open)}
          aria-expanded={zonesOpen}
          className={cn(ITEM_BASE, ITEM_INACTIVE)}
        >
          <Layers size={18} strokeWidth={1.5} />
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
                <li key={i} className="px-3 py-1">
                  <Skeleton variant="line" width="70%" height={10} className="bg-white/60" />
                </li>
              ))}
            {zones?.map((zone) => (
              <li key={zone.id}>
                <Link
                  to={`/zones/${zone.id}`}
                  className="flex w-full items-center gap-2.5 rounded-control px-3 py-1 text-sm text-sidebar-muted transition-colors duration-150 hover:bg-white/60 hover:text-sidebar-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                >
                  <span
                    className={cn('h-2 w-2 shrink-0 rounded-full', ZONE_DOT[zone.state])}
                    aria-hidden
                  />
                  <span className="truncate">{zone.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <NavLink
          to="/analytics"
          className={({ isActive }) =>
            cn(ITEM_BASE, isActive ? 'bg-white text-sage shadow-soft' : ITEM_INACTIVE)
          }
        >
          <BarChart3 size={18} strokeWidth={1.5} />
          Analytics
        </NavLink>
        <NavLink
          to="/clips"
          className={({ isActive }) =>
            cn(ITEM_BASE, isActive ? 'bg-white text-sage shadow-soft' : ITEM_INACTIVE)
          }
        >
          <Film size={18} strokeWidth={1.5} />
          Clips
        </NavLink>
        <NavLink
          to="/reports"
          className={({ isActive }) =>
            cn(ITEM_BASE, isActive ? 'bg-white text-sage shadow-soft' : ITEM_INACTIVE)
          }
        >
          <FileText size={18} strokeWidth={1.5} />
          Reports
        </NavLink>
        {(isAdmin || user?.role === 'AUDITOR') && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              cn(ITEM_BASE, isActive ? 'bg-white text-sage shadow-soft' : ITEM_INACTIVE)
            }
          >
            <ShieldCheck size={18} strokeWidth={1.5} />
            Admin
          </NavLink>
        )}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(ITEM_BASE, isActive ? 'bg-white text-sage shadow-soft' : ITEM_INACTIVE)
          }
        >
          <Settings size={18} strokeWidth={1.5} />
          Settings
        </NavLink>
      </nav>

      {/* Bottom — platform-health chip + account menu.
          CR-1: no add-camera card in the sidebar; the profile block lives here
          so it is reachable from every page. */}
      <div className="space-y-2 px-4 pb-6">
        <div className="flex items-center gap-2 rounded-tile bg-white/60 p-3 text-xs text-sidebar-muted">
          <HeartPulse
            size={16}
            strokeWidth={1.5}
            className={platformHealthy ? 'text-state-healthy' : 'text-state-critical'}
          />
          {platformHealthy ? 'Platform Healthy · heartbeat 20 s' : 'Critical incidents open'}
        </div>
        <AccountMenu />
      </div>
    </aside>
  );
}
