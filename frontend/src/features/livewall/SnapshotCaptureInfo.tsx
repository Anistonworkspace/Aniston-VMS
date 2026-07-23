import { formatDateTime } from '@/lib/utils';

export interface SnapshotCaptureInfoProps {
  /** Human name of the source camera, e.g. "Front Door". */
  cameraName: string;
  /** Short operator-facing camera code, e.g. "CAM-001". */
  cameraCode: string;
  /** ISO-8601 instant the screenshot was captured off the feed. */
  capturedAt: string;
}

/**
 * Always-on caption bar pinned to the bottom of a stored-screenshot image. It
 * groups the capture provenance a viewer needs to trust a still — which camera
 * it came from and exactly when it was taken — into one legible strip instead of
 * scattering it around the tile.
 *
 * The timestamp is rendered as an absolute local date/time (not "5 min ago")
 * inside a semantic <time> element, so a screenshot is unambiguously anchored to
 * a moment even when a wall is left open for hours. Exact coordinates for the
 * camera live in the Camera Detail drawer's Device section (they are identical
 * for every screenshot of a fixed camera, so repeating them per-tile is noise).
 */
export function SnapshotCaptureInfo({
  cameraName,
  cameraCode,
  capturedAt,
}: SnapshotCaptureInfoProps): JSX.Element {
  return (
    <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/70 via-black/40 to-transparent p-2.5 pt-6">
      <p className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/80">
          Screenshot
        </span>
        <span className="min-w-0 truncate text-xs font-medium text-white">
          <span className="tabular-nums">{cameraCode}</span>
          <span className="text-white/60"> · {cameraName}</span>
        </span>
      </p>
      <time
        dateTime={capturedAt}
        className="text-[10px] font-medium tabular-nums text-white/70"
      >
        {formatDateTime(capturedAt)}
      </time>
    </div>
  );
}
