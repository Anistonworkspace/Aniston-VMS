import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Cctv, Eye, MonitorPlay, MoreVertical } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { scalePopDown } from '@/lib/animations';
import type { ZoneState, ZoneSummary } from '@/types/vms';

// Pastel folder-style zone card — docs/04-uiux-brief.md §7 Row 1.
// Tint by state: sage = all healthy · sand = warnings ·
// coral-soft = has critical · indigo = maintenance-heavy.
const TINTS: Record<ZoneState, { card: string; onDark: boolean }> = {
  healthy: { card: 'bg-sage text-white', onDark: true },
  maintenance: { card: 'bg-indigo text-white', onDark: true },
  warning: { card: 'bg-sand text-ink', onDark: false },
  critical: { card: 'bg-coral-soft text-ink', onDark: false },
};

function metaLine(zone: ZoneSummary): string {
  const cams = `${zone.cameraCount} cameras`;
  if (zone.criticalCount > 0) return `${cams} · ${zone.criticalCount} critical`;
  if (zone.warningCount > 0)
    return `${cams} · ${zone.warningCount} warning${zone.warningCount > 1 ? 's' : ''}`;
  if (zone.maintenanceCount > 0) return `${cams} · ${zone.maintenanceCount} in maintenance`;
  return `${cams} · all healthy`;
}

interface ZoneCardProps {
  zone: ZoneSummary;
  index: number;
}

export function ZoneCard({ zone, index }: ZoneCardProps): JSX.Element {
  const tint = TINTS[zone.state];
  return (
    <Link
      to={`/zones/${zone.id}`}
      aria-label={`Open ${zone.name} zone`}
      className={cn(
        'flex h-52 flex-col rounded-card p-4 shadow-soft transition-shadow duration-150 hover:shadow-soft-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage',
        tint.card
      )}
    >
      <div className="flex items-start justify-between">
        <span
          className={cn(
            'text-sm font-medium tabular-nums',
            tint.onDark ? 'text-white/70' : 'text-muted'
          )}
        >
          {String(index + 1).padStart(2, '0')}
        </span>
        <ZoneCardMenu zone={zone} onDark={tint.onDark} />
      </div>
      <div className="grid flex-1 place-items-center">
        <Cctv size={30} strokeWidth={1.5} className={tint.onDark ? 'text-white' : 'text-ink'} />
      </div>
      <div className="pb-1 text-center">
        <h3 className="font-heading text-base font-semibold">{zone.name}</h3>
        <p className={cn('mt-0.5 text-xs', tint.onDark ? 'text-white/75' : 'text-muted')}>
          {metaLine(zone)}
        </p>
      </div>
    </Link>
  );
}

interface ZoneCardMenuProps {
  zone: ZoneSummary;
  onDark: boolean;
}

// Hand-rolled accessible dropdown — matches the codebase convention
// (AnimatedPopover-style framer-motion; Radix is unused). The menu lives
// inside the card <Link>, so every interaction guards against bubbling that
// would otherwise trigger zone navigation.
function ZoneCardMenu({ zone, onDark }: ZoneCardMenuProps): JSX.Element {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape while the menu is open.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Guard so a click never bubbles up to the card <Link>.
  function stop(e: ReactMouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
  }

  function go(to: string) {
    return (e: ReactMouseEvent): void => {
      stop(e);
      setOpen(false);
      navigate(to);
    };
  }

  const items = [
    { label: 'Open zone', icon: Eye, to: `/zones/${zone.id}` },
    { label: 'View cameras', icon: Cctv, to: `/cameras?zone=${zone.id}` },
    { label: 'Open in Live Wall', icon: MonitorPlay, to: `/live?zone=${zone.id}` },
  ];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={`Zone ${zone.name} menu`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          stop(e);
          setOpen((v) => !v);
        }}
        className={cn(
          'rounded-control p-1 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage',
          onDark ? 'text-white/70 hover:text-white' : 'text-muted hover:text-ink'
        )}
      >
        <MoreVertical size={18} strokeWidth={1.5} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label={`${zone.name} actions`}
            variants={scalePopDown}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute right-0 top-full z-20 mt-1 w-44 origin-top-right overflow-hidden rounded-card bg-white py-1 text-ink shadow-soft-hover"
          >
            {items.map(({ label, icon: Icon, to }) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                onClick={go(to)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink transition-colors duration-150 hover:bg-sage/10 focus-visible:bg-sage/10 focus-visible:outline-none"
              >
                <Icon size={16} strokeWidth={1.5} className="text-muted" />
                {label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
