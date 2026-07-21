import { skipToken } from '@reduxjs/toolkit/query';
import { AnimatedModal, Badge, Skeleton } from '@/components/ui';
import { useGetIncidentDetailQuery } from '@/features/incidents/incidents.api';
import { SeverityBadge, IncidentStatusChip } from '@/features/incidents/IncidentBadges';
import type { EvidenceRef } from '@/features/incidents/incidents.types';
import { useListCameraSnapshotsQuery } from '@/features/cameras/cameras.api';
import { prettyEnum } from '@/lib/prettyEnum';
import { timeAgo } from './timeAgo';

interface IncidentDetailModalProps {
  /** Non-null opens the modal and drives the detail query; null keeps it closed. */
  incidentId: string | null;
  onClose: () => void;
}

function Field({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-ink">{value}</dd>
    </div>
  );
}

function EvidenceTile({
  label,
  evidence,
  imageUrl,
}: {
  label: string;
  evidence: EvidenceRef | null;
  imageUrl?: string;
}): JSX.Element {
  return (
    <figure className="min-w-0 flex-1">
      <div className="relative h-28 overflow-hidden rounded-tile bg-charcoal/10">
        {evidence && imageUrl ? (
          <img
            src={imageUrl}
            alt={`${label} snapshot`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center text-xs text-muted">No image</div>
        )}
      </div>
      <figcaption className="mt-1.5 text-xs text-muted">
        {label}
        {evidence ? ` · ${timeAgo(evidence.capturedAt)}` : ' · not captured'}
      </figcaption>
    </figure>
  );
}

/**
 * Read-only incident detail overlay for the Overview "Recent incidents" card.
 * Reuses AnimatedModal (Escape · backdrop-click · close button · scroll-lock ·
 * role="dialog"/aria-modal) and pulls real data from GET /incidents/:id.
 */
export function IncidentDetailModal({
  incidentId,
  onClose,
}: IncidentDetailModalProps): JSX.Element {
  const {
    data: incident,
    isLoading,
    isError,
    refetch,
  } = useGetIncidentDetailQuery(incidentId ?? skipToken);

  // Evidence refs carry only { id, capturedAt }; resolve signed thumbnails by
  // matching ids inside the camera's snapshot list (window capped at 336 h, the
  // backend max — older evidence degrades to a metadata-only tile).
  const refs = [incident?.previousSnapshot, incident?.faultSnapshot].filter(
    (ref): ref is EvidenceRef => !!ref
  );
  const earliest = refs.length
    ? Math.min(...refs.map((ref) => new Date(ref.capturedAt).getTime()))
    : null;
  const evidenceHours = earliest
    ? Math.min(336, Math.max(1, Math.ceil((Date.now() - earliest) / 3_600_000) + 1))
    : null;
  const { data: snapshots } = useListCameraSnapshotsQuery(
    incident?.cameraId && evidenceHours
      ? { cameraId: incident.cameraId, hours: evidenceHours, limit: 500 }
      : skipToken
  );
  const urlFor = (ref: EvidenceRef | null): string | undefined =>
    ref ? snapshots?.find((snapshot) => snapshot.id === ref.id)?.thumbUrl : undefined;

  return (
    <AnimatedModal
      open={incidentId !== null}
      onClose={onClose}
      size="xl"
      title={incident ? incident.incidentNumber : 'Incident'}
    >
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton variant="line" width="40%" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton variant="line" width="50%" height={10} />
                <Skeleton variant="line" width="80%" />
              </div>
            ))}
          </div>
          <Skeleton className="h-28 rounded-tile" />
        </div>
      ) : isError || !incident ? (
        <div className="py-8 text-center">
          <p className="text-sm text-muted">
            {isError ? 'Couldn’t load this incident.' : 'Incident not found.'}
          </p>
          {isError && (
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-3 rounded-control bg-sage px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-sage-hover"
            >
              Retry
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={incident.severity} />
            <IncidentStatusChip status={incident.status} />
            <Badge variant="default" size="sm">
              {prettyEnum(incident.type)}
            </Badge>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Field label="Zone" value={incident.zone.name} />
            <Field label="Site" value={incident.site.name} />
            <Field
              label="Camera"
              value={
                incident.camera
                  ? `${incident.camera.name} (${incident.camera.cameraCode})`
                  : 'Site-level'
              }
            />
            <Field
              label="First detected"
              value={new Date(incident.firstDetectedAt).toLocaleString()}
            />
            <Field label="Last seen" value={timeAgo(incident.lastDetectedAt)} />
            <Field label="Assigned to" value={incident.assignedTo?.email ?? 'Unassigned'} />
          </dl>

          {incident.diagnosis && (
            <div>
              <h3 className="text-xs uppercase tracking-wide text-muted">Diagnosis</h3>
              <p className="mt-1 text-sm text-ink">{incident.diagnosis}</p>
            </div>
          )}

          {(incident.previousSnapshot || incident.faultSnapshot) && (
            <div>
              <h3 className="text-sm font-semibold text-ink">Evidence</h3>
              <div className="mt-3 flex gap-3">
                <EvidenceTile
                  label="Before (last healthy)"
                  evidence={incident.previousSnapshot}
                  imageUrl={urlFor(incident.previousSnapshot)}
                />
                <EvidenceTile
                  label="At fault"
                  evidence={incident.faultSnapshot}
                  imageUrl={urlFor(incident.faultSnapshot)}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </AnimatedModal>
  );
}
