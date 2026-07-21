import { useCallback, useEffect, useRef, useState } from 'react';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import { Loader2, RefreshCw, VideoOff, X } from 'lucide-react';
import { getApiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/utils';
import type { Camera } from '@/features/cameras/cameras.types';
import { HlsPlayer, type PlayerStatus } from './HlsPlayer';
import { HEARTBEAT_INTERVAL_MS } from './livewall.constants';
import {
  useEndStreamMutation,
  useStartStreamMutation,
  useStreamHeartbeatMutation,
} from './livewall.api';
import type { StreamSession } from './livewall.types';

export interface LiveTileProps {
  camera: Camera;
  onRemove: () => void;
}

/**
 * One wall cell. Owns the full session lifecycle: POST /streams/start on
 * mount, heartbeat every 20 s (timeout is 45 s server-side), POST /streams/:id/end
 * on unmount. The backend reaper cleans up if the tab dies without unmounting.
 */
export function LiveTile({ camera, onRemove }: LiveTileProps): JSX.Element {
  const [startStream] = useStartStreamMutation();
  const [heartbeat] = useStreamHeartbeatMutation();
  const [endStream] = useEndStreamMutation();

  const [session, setSession] = useState<StreamSession | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let sessionId: string | null = null;
    let timer: number | undefined;

    setSession(null);
    setStartError(null);
    setPlayerStatus('loading');

    startStream({ cameraId: camera.id, kind: 'LIVE_SUB' })
      .unwrap()
      .then((started) => {
        if (cancelled) {
          // Unmounted before start resolved — close the orphan immediately.
          void endStream({ id: started.id, reason: 'tile closed' });
          return;
        }
        sessionId = started.id;
        setSession(started);
        timer = window.setInterval(() => {
          void heartbeat({ id: started.id });
        }, HEARTBEAT_INTERVAL_MS);
      })
      .catch((err: unknown) => {
        if (!cancelled) setStartError(getApiErrorMessage(err as FetchBaseQueryError));
      });

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearInterval(timer);
      if (sessionId) void endStream({ id: sessionId, reason: 'tile closed' });
    };
  }, [camera.id, attempt, startStream, heartbeat, endStream]);

  const showError = startError !== null || playerStatus === 'error';
  const showLoading = !showError && (session === null || playerStatus === 'loading');

  return (
    <div className="group relative aspect-video overflow-hidden rounded-tile bg-charcoal shadow-soft">
      {session && !startError && (
        <HlsPlayer
          src={session.hlsUrl}
          onStatus={setPlayerStatus}
          className="h-full w-full object-cover"
        />
      )}

      {/* Top bar: camera identity + remove */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/60 to-transparent p-2.5">
        <p className="min-w-0 truncate text-xs font-medium text-white">
          <span className="tabular-nums">{camera.cameraCode}</span>
          <span className="text-white/60"> · {camera.name}</span>
        </p>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${camera.name} from wall`}
          className="rounded-full bg-black/40 p-1 text-white/70 opacity-0 transition-opacity hover:text-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white group-hover:opacity-100"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Bottom-left chips */}
      <div className="absolute bottom-2 left-2.5 flex items-center gap-1.5">
        {playerStatus === 'playing' && (
          <span className="flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-coral" aria-hidden />
            Live
          </span>
        )}
        {session?.simMode && (
          <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">
            Sim
          </span>
        )}
      </div>

      {/* Loading / error overlays */}
      {showLoading && (
        <div className="absolute inset-0 grid place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-white/50" aria-label="Connecting" />
        </div>
      )}
      {showError && (
        <div className="absolute inset-0 grid place-items-center bg-charcoal/80">
          <div className="text-center">
            <VideoOff size={20} strokeWidth={1.5} className="mx-auto text-white/40" />
            <p className="mt-2 max-w-[22ch] text-xs text-white/70">
              {startError ?? 'Stream unavailable'}
            </p>
            <button
              type="button"
              onClick={() => setAttempt((current) => current + 1)}
              className={cn(
                'mx-auto mt-3 flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white',
                'transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white'
              )}
            >
              <RefreshCw size={12} />
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
