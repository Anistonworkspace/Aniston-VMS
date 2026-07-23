import { motion } from 'framer-motion';
import { Cctv, SlidersHorizontal, Trash2, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { listItem } from '@/lib/animations';
import { timeAgo } from '@/features/overview/timeAgo';
import { CameraStatusBadge, DraftBadge } from './CameraStatusBadge';
import { prettyEnum } from '@/lib/prettyEnum';
import type { Camera, CameraStatus } from './cameras.types';

const BAR: Record<CameraStatus, string> = {
  HEALTHY: 'bg-state-healthy',
  WARNING: 'bg-state-warning',
  CRITICAL: 'bg-state-critical',
  MAINTENANCE: 'bg-state-maintenance',
  UNKNOWN: 'bg-state-unknown',
};

export function CameraCard({
  camera,
  onOpen,
  onConfigure,
  selectable = false,
  onSelect,
}: {
  camera: Camera;
  onOpen: (id: string) => void;
  /** DRAFT cameras open the configure (placement + stream) flow instead of the health drawer. */
  onConfigure?: (camera: Camera) => void;
  /** In selection mode the card picks the camera for deletion instead of navigating. */
  selectable?: boolean;
  onSelect?: (camera: Camera) => void;
}): JSX.Element {
  const score = Math.max(0, Math.min(100, camera.healthScore));
  const isDraft = camera.provisioningState === 'DRAFT';

  const handleClick = (): void => {
    if (selectable) {
      onSelect?.(camera);
      return;
    }
    if (isDraft) {
      onConfigure?.(camera);
      return;
    }
    onOpen(camera.id);
  };

  const label = selectable
    ? `Select ${camera.name} to delete`
    : isDraft
      ? `Configure ${camera.name}`
      : undefined;

  return (
    <motion.article variants={listItem}>
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={selectable ? false : undefined}
        aria-label={label}
        className={cn(
          'relative w-full rounded-card bg-card p-5 text-left shadow-soft transition-shadow duration-150 hover:shadow-soft-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage',
          selectable && 'ring-2 ring-coral/40 hover:ring-coral',
          isDraft && !selectable && 'ring-1 ring-dashed ring-state-unknown/40'
        )}
      >
        {selectable && (
          <span
            aria-hidden
            className="pointer-events-none absolute -right-2 -top-2 z-10 grid h-6 w-6 place-items-center rounded-full border-2 border-coral bg-card shadow-soft"
          >
            <Trash2 size={12} className="text-coral" />
          </span>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-tile bg-canvas text-ink">
              <Cctv size={18} strokeWidth={1.5} />
            </span>
            <div className="min-w-0">
              <h3 className="truncate font-heading text-sm font-semibold text-ink">
                {camera.name}
              </h3>
              <p className="mt-0.5 truncate text-xs text-tertiary">
                {camera.cameraCode}
                {camera.site ? ` · ${camera.site.name}` : ''}
              </p>
            </div>
          </div>
          {isDraft ? <DraftBadge /> : <CameraStatusBadge status={camera.status} />}
        </div>

        {isDraft ? (
          // DRAFT cameras aren't health-monitored yet — prompt the user to finish
          // provisioning instead of showing a meaningless health bar.
          <div className="mt-4 flex items-center gap-2 text-xs font-medium text-state-unknown">
            <SlidersHorizontal size={12} strokeWidth={1.5} />
            <span className="truncate">Not configured — click to place &amp; connect</span>
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center justify-between gap-2 text-xs text-tertiary">
              <span>
                Health <span className="font-semibold tabular-nums text-ink">{score}</span>/100
              </span>
              <span className="flex min-w-0 items-center gap-2">
                {camera.maintenanceMode && (
                  <span className="flex shrink-0 items-center gap-1 text-state-maintenance">
                    <Wrench size={12} strokeWidth={1.5} /> maintenance
                  </span>
                )}
                <span className="truncate">
                  {camera.lastHealthyAt
                    ? `healthy ${timeAgo(camera.lastHealthyAt)}`
                    : 'never healthy'}
                </span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas">
              <div
                className={cn('h-full rounded-full', BAR[camera.status] ?? BAR.UNKNOWN)}
                style={{ width: `${score}%` }}
              />
            </div>

            {camera.diagnosis && camera.status !== 'HEALTHY' && (
              <p
                className={cn(
                  'mt-3 truncate text-xs font-medium',
                  camera.status === 'CRITICAL' ? 'text-state-critical' : 'text-state-warning'
                )}
              >
                {prettyEnum(camera.diagnosis)}
              </p>
            )}
          </>
        )}
      </button>
    </motion.article>
  );
}
