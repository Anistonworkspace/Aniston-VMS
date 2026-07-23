import { cn } from '@/lib/utils';
import { prettyEnum } from '@/lib/prettyEnum';
import type { CameraStatus } from './cameras.types';

// Chip colours map 1:1 to the prisma CameraStatus enum via the state-* design
// tokens (tailwind.config.js → --status-* CSS variables).
const CHIP: Record<CameraStatus, string> = {
  HEALTHY: 'bg-state-healthy-soft text-state-healthy',
  WARNING: 'bg-state-warning-soft text-state-warning',
  CRITICAL: 'bg-state-critical-soft text-state-critical',
  MAINTENANCE: 'bg-state-maintenance-soft text-state-maintenance',
  UNKNOWN: 'bg-state-unknown-soft text-state-unknown',
};

export function CameraStatusBadge({
  status,
  className,
}: {
  status: CameraStatus;
  className?: string;
}): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        CHIP[status] ?? CHIP.UNKNOWN,
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {prettyEnum(status)}
    </span>
  );
}

// DRAFT cameras are registered but not yet placed/wired, so they carry no health
// status. This neutral pill signals that provisioning is still incomplete and
// replaces the health chip until the camera is configured + activated.
export function DraftBadge({ className }: { className?: string }): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full bg-state-unknown-soft px-2.5 py-0.5 text-xs font-medium text-state-unknown',
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full border border-current" aria-hidden />
      Draft
    </span>
  );
}
