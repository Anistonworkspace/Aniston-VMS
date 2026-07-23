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
  PanelLeftClose,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
const ITEM_INACTIVE = 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-text';

const ZONE_DOT: Record<ZoneState, string> = {
  healthy: 'bg-state-healthy',
  warning: 'bg-state-warning',
  critical: 'bg-state-critical',
  maintenance: 'bg-state-maintenance',
};

interface SidebarProps {
  /** When true, render the compact icon-only rail instead of the full sidebar. */
  collapsed: boolean;
  /** Expand the sidebar back to full width (used by collapsed-only controls). */
  onExpand: () => void;
  /** Collapse the sidebar to the compact rail (used by the expanded header control). */
  onCollapse: () => void;
}

// A single top-level nav entry. Collapsed rendering hides the label, centers the
// icon, and exposes the label as a native tooltip so the icon rail stays usable.
function NavItem({
  to,
  icon: Icon,
  label,
  collapsed,
  badge,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  collapsed: boolean;
  badge?: number;
}): JSX.Element {
  const showBadge = badge != null && badge > 0;
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          ITEM_BASE,
          collapsed && 'justify-center px-0',
          isActive ? 'bg-card text-sage shadow-soft' : ITEM_INACTIVE,
        )
      }
    >
      <span className="relative flex shrink-0">
        <Icon size={18} strokeWidth={1.5} />
        {collapsed && showBadge && (
          <span
            className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full bg-coral"
            aria-hidden
          />
        )}
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && showBadge && (
        <span className="ml-auto rounded-full bg-coral px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white">
          {badge}
        </span>
      )}
    </NavLink>
  );
}

export function Sidebar({ collapsed, onExpand, onCollapse }: SidebarProps): JSX.Element {
  const [zonesOpen, setZonesOpen] = useState(true);
  const { data: user } = useGetCurrentUserQuery();
  const { data: zones, isLoading: zonesLoading } = useListZoneSummariesQuery();
  const { data: incidents } = useListRecentIncidentsQuery();
  const { data: health } = useGetHealthSummaryQuery();

  const isAdmin = isAdminRole(user?.role);
  const openIncidents = incidents?.filter((i) => i.status !== 'RESOLVED').length ?? 0;
  const platformHealthy = (health?.critical ?? 0) === 0;

  return (
    <aside
      className={cn(
        'hidden h-full shrink-0 flex-col overflow-hidden bg-sidebar transition-[width] duration-200 ease-in-out lg:flex',
        collapsed ? 'w-16' : 'w-[260px]',
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center pt-7', collapsed ? 'justify-center px-0' : 'gap-2.5 px-6')}>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sage">
          <Cctv size={16} strokeWidth={1.5} className="text-white" />
        </span>
        {!collapsed && (
          <>
            <span className="font-heading text-md font-semibold text-ink">Aniston VMS</span>
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Collapse sidebar"
              className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-control text-sidebar-muted transition-colors duration-150 hover:bg-sidebar-hover hover:text-sidebar-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            >
              <PanelLeftClose size={18} strokeWidth={1.5} />
            </button>
          </>
        )}
      </div>

      {/* Nav */}
      <nav
        className={cn(
          'no-scrollbar mt-7 flex-1 space-y-0.5 overflow-y-auto pb-4',
          collapsed ? 'px-2' : 'px-4',
        )}
        aria-label="Primary"
      >
        <NavItem to="/" icon={LayoutDashboard} label="Dashboard" collapsed={collapsed} />
        <NavItem to="/live" icon={MonitorPlay} label="Live Wall" collapsed={collapsed} />
        <NavItem to="/cameras" icon={Cctv} label="Cameras" collapsed={collapsed} />
        <NavItem
          to="/incidents"
          icon={AlertTriangle}
          label="Incidents"
          collapsed={collapsed}
          badge={openIncidents}
        />

        <button
          type="button"
          onClick={() => {
            if (collapsed) {
              onExpand();
              setZonesOpen(true);
            } else {
              setZonesOpen((open) => !open);
            }
          }}
          aria-expanded={collapsed ? undefined : zonesOpen}
          title={collapsed ? 'Zones' : undefined}
          className={cn(ITEM_BASE, collapsed && 'justify-center px-0', ITEM_INACTIVE)}
        >
          <Layers size={18} strokeWidth={1.5} className="shrink-0" />
          {!collapsed && (
            <>
              <span className="truncate">Zones</span>
              <ChevronDown
                size={16}
                strokeWidth={1.5}
                className={cn(
                  'ml-auto transition-transform duration-150',
                  zonesOpen && 'rotate-180',
                )}
              />
            </>
          )}
        </button>
        {!collapsed && zonesOpen && (
          <ul className="space-y-0.5 pl-4">
            {zonesLoading &&
              [0, 1, 2].map((i) => (
                <li key={i} className="px-3 py-1">
                  <Skeleton variant="line" width="70%" height={10} className="bg-sidebar-hover" />
                </li>
              ))}
            {zones?.map((zone) => (
              <li key={zone.id}>
                <Link
                  to={`/zones/${zone.id}`}
                  className="flex w-full items-center gap-2.5 rounded-control px-3 py-1 text-sm text-sidebar-muted transition-colors duration-150 hover:bg-sidebar-hover hover:text-sidebar-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
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

        <NavItem to="/analytics" icon={BarChart3} label="Analytics" collapsed={collapsed} />
        <NavItem to="/clips" icon={Film} label="Clips" collapsed={collapsed} />
        <NavItem to="/reports" icon={FileText} label="Reports" collapsed={collapsed} />
        {(isAdmin || user?.role === 'AUDITOR') && (
          <NavItem to="/admin" icon={ShieldCheck} label="Admin" collapsed={collapsed} />
        )}
        <NavItem to="/settings" icon={Settings} label="Settings" collapsed={collapsed} />
      </nav>

      {/* Bottom — platform-health chip + account menu.
          CR-1: no add-camera card in the sidebar; the profile block lives here
          so it is reachable from every page. */}
      <div className={cn('space-y-2 pb-6', collapsed ? 'px-2' : 'px-4')}>
        <div
          title={
            collapsed
              ? platformHealthy
                ? 'Platform Healthy · heartbeat 20 s'
                : 'Critical incidents open'
              : undefined
          }
          className={cn(
            'flex items-center rounded-tile bg-sidebar-hover text-xs text-sidebar-muted',
            collapsed ? 'justify-center p-2' : 'gap-2 p-3',
          )}
        >
          <HeartPulse
            size={16}
            strokeWidth={1.5}
            className={cn(
              'shrink-0',
              platformHealthy ? 'text-state-healthy' : 'text-state-critical',
            )}
          />
          {!collapsed &&
            (platformHealthy ? 'Platform Healthy · heartbeat 20 s' : 'Critical incidents open')}
        </div>
        <AccountMenu collapsed={collapsed} />
      </div>
    </aside>
  );
}
