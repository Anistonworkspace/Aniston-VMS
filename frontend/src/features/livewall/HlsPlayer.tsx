import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

export type PlayerStatus = 'loading' | 'playing' | 'error';

export interface HlsPlayerProps {
  src: string;
  className?: string;
  onStatus?: (status: PlayerStatus) => void;
}

/**
 * Thin hls.js wrapper: MSE path when supported, native HLS fallback (Safari),
 * error signalling via onStatus. Muted + autoplay so browsers allow playback
 * without a user gesture.
 */
export function HlsPlayer({ src, className, onStatus }: HlsPlayerProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    statusRef.current?.('loading');

    let hls: Hls | null = null;
    if (Hls.isSupported()) {
      // COLD-START: a first view of an on-demand camera (especially an HEVC sub
      // stream transcoded to H.264) triggers MediaMTX runOnDemand, whose
      // `runOnDemandStartTimeout` is 15s (see mediamtx.adapter.ts). The backend
      // returns the HLS URL as soon as the path config is accepted — before the
      // transcode has produced its first segment — so the manifest 404s during
      // spin-up. hls.js's default manifest errorRetry budget is a single retry
      // (~1-2s), which gives up long before the stream is ready and paints a
      // spurious error that needs a manual Retry. Widen the manifest retry
      // budget to ride out the declared 15s window instead of tight-looping
      // (the ERROR handler below still stops on genuine fatals).
      hls = new Hls({
        liveDurationInfinity: true,
        manifestLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 10_000,
            maxLoadTimeMs: 20_000,
            timeoutRetry: { maxNumRetry: 4, retryDelayMs: 0, maxRetryDelayMs: 0 },
            errorRetry: { maxNumRetry: 8, retryDelayMs: 1_000, maxRetryDelayMs: 2_000 },
          },
        },
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          // Fatal = hls.js has already exhausted its internal retries. Stop
          // loading so we don't keep hitting the (failed) media-authorize gate,
          // then signal the terminal state up to LiveTile so it can release the
          // server-side session slot instead of retrying in a tight loop.
          hls?.stopLoad();
          statusRef.current?.('error');
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
    } else {
      statusRef.current?.('error');
      return undefined;
    }

    const handlePlaying = (): void => statusRef.current?.('playing');
    const handleError = (): void => statusRef.current?.('error');
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('error', handleError);
    void video.play().catch(() => undefined);

    return () => {
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('error', handleError);
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [src]);

  return <video ref={videoRef} muted autoPlay playsInline className={className} />;
}
