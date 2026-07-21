import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Radio, RadioTower, Rewind, Video } from 'lucide-react';
import { Badge, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/apiError';
import { useToast } from '@/hooks/useToast';
import {
  useEndSessionMutation,
  useHeartbeatSessionMutation,
  useStartSessionMutation,
} from './playback.api';
import type { CameraLite, StreamKind, StreamSession } from './playback.types';
import type { TimeRange } from './RecordingTimeline';

// Heartbeat interval is intentionally well under the backend's
// STREAM_SESSION_TIMEOUT_SECONDS (45s — see backend/src/config/env.ts) so a
// session never lapses while this stage is mounted and visible.
const HEARTBEAT_INTERVAL_MS = 20_000;

interface StreamStageProps {
  camera: CameraLite;
  kind: StreamKind;
  /** Required (and only used) when kind === 'PLAYBACK'. */
  playbackRange: TimeRange | null;
}

const KIND_LABEL: Record<StreamKind, string> = {
  LIVE_MAIN: 'Live · Main stream',
  LIVE_SUB: 'Live · Sub stream',
  PLAYBACK: 'Playback',
};

/**
 * Owns the lifecycle of one StreamSession (start → heartbeat → end) for the
 * given camera + kind, and renders the resulting feed. Real media playback
 * depends on a reachable MediaMTX/ffmpeg stack (env.PLAYBACK_SIM_MODE=false);
 * when the backend reports simMode: true there is nothing real to attach a
 * <video> element to, so we render an explicit simulated-stream view
 * instead of a broken player.
 */
export function StreamStage({ camera, kind, playbackRange }: StreamStageProps) {
  const [startSession] = useStartSessionMutation();
  const [heartbeatSession] = useHeartbeatSessionMutation();
  const [endSession] = useEndSessionMutation();
  const toast = useToast();

  const [session, setSession] = useState<StreamSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const sessionIdRef = useRef<string | null>(null);

  const needsRange = kind === 'PLAYBACK';
  const canStart = !needsRange || !!playbackRange;

  useEffect(() => {
    if (!canStart) {
      setSession(null);
      return;
    }

    let cancelled = false;
    setStarting(true);
    setStartError(null);
    setVideoFailed(false);

    startSession({
      cameraId: camera.id,
      kind,
      ...(kind === 'PLAYBACK' && playbackRange
        ? { startAt: playbackRange.startAt, endAt: playbackRange.endAt }
        : {}),
    })
      .unwrap()
      .then((result) => {
        if (cancelled) return;
        sessionIdRef.current = result.id;
        setSession(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setStartError(getApiErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setStarting(false);
      });

    return () => {
      cancelled = true;
      const activeId = sessionIdRef.current;
      sessionIdRef.current = null;
      setSession(null);
      if (activeId) {
        endSession({ id: activeId, body: { reason: 'client_navigated_away' } }).catch(() => {
          // Best-effort — the backend's playback.reaper.ts also sweeps stale sessions.
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera.id, kind, playbackRange?.startAt, playbackRange?.endAt, canStart]);

  // Heartbeat loop keeps the session alive while this stage stays mounted.
  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => {
      heartbeatSession({ id: session.id, body: {} })
        .unwrap()
        .catch((err) => {
          toast.error('Stream heartbeat failed', getApiErrorMessage(err));
        });
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  if (needsRange && !playbackRange) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-dashed border-hairline bg-surface text-sm text-muted">
        <Rewind className="mr-2 h-4 w-4" />
        Select a range on the recording timeline below to start playback
      </div>
    );
  }

  if (starting || (!session && !startError)) {
    return <Skeleton className="aspect-video w-full rounded-2xl" />;
  }

  if (startError) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-2xl border border-state-critical/30 bg-state-critical-soft px-4 text-center text-sm text-state-critical">
        <AlertTriangle className="h-5 w-5" />
        {startError}
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="space-y-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-charcoal">
        {session.simMode || videoFailed ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/70">
            <Video className="h-10 w-10 text-white/40" />
            <p className="text-sm font-medium text-white">
              Simulated feed — no live media server connected
            </p>
            <p className="max-w-sm text-center text-xs text-white/60">
              {camera.cameraCode} · {session.mediamtxPath}
            </p>
          </div>
        ) : (
          // Native HLS playback (Safari); other browsers will fall back to the
          // simulated-stream view via onError since no hls.js is bundled here.
          <video
            key={session.id}
            className="h-full w-full object-contain"
            controls
            autoPlay
            muted
            playsInline
            src={session.hlsUrl}
            onError={() => setVideoFailed(true)}
          />
        )}

        <div className="absolute left-3 top-3 flex items-center gap-2">
          <Badge variant={kind === 'PLAYBACK' ? 'purple' : 'danger'} size="sm">
            {kind !== 'PLAYBACK' && <Radio className="mr-1 h-3 w-3 animate-pulse" />}
            {KIND_LABEL[kind]}
          </Badge>
          {session.simMode && (
            <Badge variant="warning" size="sm">
              Simulated
            </Badge>
          )}
        </div>
        <div className="absolute right-3 top-3">
          <Badge variant="default" size="sm" className="bg-charcoal/50 text-white">
            <RadioTower className="mr-1 h-3 w-3" />
            {camera.cameraCode}
          </Badge>
        </div>
      </div>
      <p className={cn('text-xs text-muted')}>
        Session {session.id.slice(0, 8)} · started{' '}
        {new Date(session.startedAt).toLocaleTimeString()}
      </p>
    </div>
  );
}
