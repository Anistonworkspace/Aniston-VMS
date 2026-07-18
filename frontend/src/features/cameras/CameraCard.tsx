import { motion } from 'framer-motion';
import { Cctv, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { listItem } from '@/lib/animations';
import { timeAgo } from '@/features/overview/timeAgo';
import { CameraStatusBadge } from './CameraStatusBadge';
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
}: {
  camera: Camera;
  onOpen: (id: string) => void;
}): JSX.Element {
  const score = Math.max(0, Math.min(100, camera.healthScore));

  return (
    <motion.article variants={listItem}>
      <button
        type="button"
        onClick={() => onOpen(camera.id)}
        className="w-full rounded-card bg-card p-5 text-left shadow-soft transition-shadow duration-150 hover:shadow-soft-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-tile bg-canvas text-ink">
              <Cctv size={18} strokeWidth={1.5} />
            </span>
            <div className="min-w-0">
              <h3 className="truncate font-heading text-sm font-semibold text-ink">
                {camera.name}
              </h3>
              <p className="mt-0.5 truncate text-xs text-gray-500">
                {camera.cameraCode}
                {camera.site ? ` · ${camera.site.name}` : ''}
              </p>
            </div>
          </div>
          <CameraStatusBadge status={camera.status} />
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 text-xs text-gray-500">
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
              {camera.lastHealthyAt ? `healthy ${timeAgo(camera.lastHealthyAt)}` : 'never healthy'}
            </span>
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
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
      </button>
    </motion.article>
  );
}
