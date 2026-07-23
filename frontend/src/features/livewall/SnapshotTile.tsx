import { useEffect, useState } from 'react';
import { ImageOff, Loader2, RefreshCw, X } from 'lucide-react';
import type { Camera } from '@/features/cameras/cameras.types';
import { useListCameraSnapshotsQuery } from '@/features/cameras/cameras.api';
import { cn } from '@/lib/utils';
import { SnapshotCaptureInfo } from './SnapshotCaptureInfo';
import { SNAPSHOT_POLL_MS } from './livewall.constants';
import { useDocumentVisible } from './useDocumentVisible';

export interface SnapshotTileProps {
  camera: Camera;
  onRemove: () => void;
}

/**
 * Live Wall tile that shows the latest STORED screenshot for a camera instead
 * of the live stream. It reuses the existing `listCameraSnapshots` endpoint —
 * the periodic SUB snapshots the backend scheduler captures off the RTSP feed,
 * NOT frames grabbed from the live player — and touches no streaming, playback,
 * media-URL, or retry code. Snapshot file URLs are pre-signed and expire
 * server-side (~10 min), so the query re-fetches well inside that window
 * (SNAPSHOT_POLL_MS), which both refreshes the image and re-mints the URL.
 *
 * Props mirror LiveTile so the two are interchangeable in the wall grid.
 */
export function SnapshotTile({ camera, onRemove }: SnapshotTileProps): JSX.Element {
  // Pause the automatic poll while the tab is hidden: a backgrounded wall needs
  // no refresh, and the pre-signed URL is simply re-minted on the next
  // foreground poll (well inside its TTL). Setting the interval to 0 stops the
  // RTK Query poll timer while keeping the cached frame on screen.
  const visible = useDocumentVisible();
  const { data, isLoading, isError, isFetching, refetch } = useListCameraSnapshotsQuery(
    { cameraId: camera.id, kind: 'SUB', limit: 1 },
    { pollingInterval: visible ? SNAPSHOT_POLL_MS : 0 }
  );

  const latest = data?.[0];
  const [imgFailed, setImgFailed] = useState(false);

  // A fresh snapshot (new pre-signed URL) resets the load-error state so a
  // transient expired/failed URL recovers on the next poll.
  useEffect(() => {
    setImgFailed(false);
  }, [latest?.thumbUrl]);

  const showImage = Boolean(latest) && !imgFailed;

  return (
    <div className="group relative aspect-video overflow-hidden rounded-tile bg-charcoal shadow-soft">
      {latest && !imgFailed && (
        <img
          key={latest.thumbUrl}
          src={latest.thumbUrl}
          alt={`Latest screenshot from ${camera.name}`}
          onError={() => setImgFailed(true)}
          className="h-full w-full object-cover"
        />
      )}

      {/* Loading — spinner while the first snapshot resolves (rule-frontend) */}
      {isLoading && !latest && (
        <div className="absolute inset-0 grid place-items-center text-white/70">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          <span className="sr-only">Loading screenshot…</span>
        </div>
      )}

      {/* Empty / error — an empty snapshot history is NOT an error (rule-frontend) */}
      {!isLoading && !showImage && (
        <div className="absolute inset-0 grid place-items-center gap-1.5 px-3 text-center">
          <ImageOff className="h-5 w-5 text-white/50" aria-hidden />
          <p className="text-[11px] font-medium text-white/70">
            {isError || imgFailed ? 'Screenshot unavailable' : 'No recent screenshot'}
          </p>
        </div>
      )}

      {/* Top bar: manual refresh + remove. Camera identity lives in the bottom
          capture-info strip (SnapshotCaptureInfo), so it is not duplicated here. */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-end gap-2 bg-gradient-to-b from-black/60 to-transparent p-2.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            aria-label={`Refresh screenshot for ${camera.name}`}
            className="rounded-full bg-black/40 p-1 text-white/70 opacity-0 transition-opacity hover:text-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed group-hover:opacity-100"
          >
            <RefreshCw
              size={14}
              strokeWidth={2}
              className={cn(isFetching && 'animate-spin')}
              aria-hidden
            />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${camera.name} from wall`}
            className="rounded-full bg-black/40 p-1 text-white/70 opacity-0 transition-opacity hover:text-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white group-hover:opacity-100"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Bottom strip: camera identity + absolute capture time. Only shown once
          a screenshot has resolved — an empty/error tile carries no capture. */}
      {showImage && latest && (
        <SnapshotCaptureInfo
          cameraName={camera.name}
          cameraCode={camera.cameraCode}
          capturedAt={latest.capturedAt}
        />
      )}
    </div>
  );
}
