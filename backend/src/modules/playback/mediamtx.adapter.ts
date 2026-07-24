import type { Camera } from '@prisma/client';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import {
  normalizeRtspUrl,
  injectRtspCredentials,
  InvalidRtspUrlError,
} from '../../lib/rtsp-url.js';
import { isBrowserPlayableCodec } from '../../lib/codec.js';
import { decrypt } from '../../utils/encryption.js';

// ─────────────────────────────────────────────────────────────────────────────
// MediaMTX adapter. Every module that needs live/playback stream URLs goes
// through here instead of building MediaMTX paths inline.
//
// URL-building (buildMediamtxPath/buildStreamEndpoints) is pure string work and
// runs in every mode. The control-plane calls (publishStream/teardownStream)
// talk to the MediaMTX HTTP API (MEDIAMTX_API_URL) to register/remove an
// on-demand RTSP pull for the camera. Both are no-ops under PLAYBACK_SIM_MODE
// so unit tests and demo-only environments (no MediaMTX/ffmpeg reachable) stay
// hermetic — mirroring HEALTH_SIM_MODE in modules/health/health.checkers.ts.
// ─────────────────────────────────────────────────────────────────────────────

export type StreamKind = 'LIVE_SUB' | 'LIVE_MAIN' | 'PLAYBACK';

export interface StreamEndpoints {
  mediamtxPath: string;
  hlsUrl: string;
  webrtcUrl: string;
  rtspUrl: string;
}

function kindSegment(kind: StreamKind): string {
  switch (kind) {
    case 'LIVE_SUB':
      return 'live-sub';
    case 'LIVE_MAIN':
      return 'live-main';
    case 'PLAYBACK':
      return 'playback';
  }
}

/**
 * Deterministic MediaMTX path for a session — stable for the lifetime of the
 * session (built once from cameraCode/kind/sessionId, then persisted on the
 * StreamSession row as `mediamtxPath`).
 */
export function buildMediamtxPath(cameraCode: string, kind: StreamKind, sessionId: string): string {
  const prefix = env.PLAYBACK_SIM_MODE ? 'sim' : 'live';
  return `${prefix}/${kindSegment(kind)}/${cameraCode}/${sessionId}`;
}

/**
 * Browser-facing stream URLs for a mediamtxPath (also rebuilt on reconnect/poll).
 *
 * SECURITY (P0-1): MediaMTX is never exposed to the browser via its localhost
 * URLs. We emit same-origin `/media/*` paths (inherit the page's HTTPS/WSS — no
 * mixed content). These URLs carry NO token: HLS/WHEP are multi-request protocols
 * whose child requests (media playlist, init/media segments, WHEP sub-resource)
 * are emitted by MediaMTX as bare relative names, so a URL-pinned token would
 * never reach them and playback would 403 after the first request. Authorization
 * instead rides an HttpOnly, path-scoped `media_auth` cookie minted on session
 * start/heartbeat (see media-auth.router.setMediaAuthCookies): the browser sends
 * it on every child request under the session prefix, the reverse proxy calls
 * GET /api/media/authorize on each, and a client cannot swap the path to reach an
 * unauthorized camera. RTSP is never surfaced to browsers. The internal
 * MEDIAMTX_* URLs are used only server-side (publishStream/teardownStream).
 */
export function buildStreamEndpoints(mediamtxPath: string): StreamEndpoints {
  const base = env.MEDIA_PUBLIC_BASE_URL; // '' → same-origin (inherits page HTTPS/WSS)
  return {
    mediamtxPath,
    hlsUrl: `${base}/media/hls/${mediamtxPath}/index.m3u8`,
    webrtcUrl: `${base}/media/webrtc/${mediamtxPath}/whep`,
    rtspUrl: '',
  };
}

// ─── Camera source resolution ────────────────────────────────────────────────

/**
 * Decrypts the camera's stored RTSP URL for the requested kind (sub-stream for
 * LIVE_SUB, main otherwise) and returns a fully-credentialed source URL that
 * MediaMTX can pull from. Never logged — it contains the camera password.
 *
 * URL hygiene (scheme validation, &amp; entity decode, byte-exact vendor-path
 * preservation, credential injection) is delegated to the canonical
 * lib/rtsp-url so streaming, Test Connection, health DESCRIBE and snapshot
 * capture all treat a given stored URL identically. `normalizeRtspUrl` throws
 * InvalidRtspUrlError on a malformed stored URL; that propagates out of
 * publishStream *before* any streamSession row is created (see
 * playback.service startSession), so a bad URL surfaces as a clean error
 * without consuming a per-camera concurrency slot.
 */
export function resolveCameraSource(camera: Camera, kind: StreamKind): string {
  const encryptedUrl =
    kind === 'LIVE_SUB' ? camera.subRtspUrlEncrypted : camera.mainRtspUrlEncrypted;
  // Post-split, the RTSP URL columns are nullable to allow DRAFT cameras with
  // identity-only rows. A CONFIGURED camera always has both main and sub URLs
  // (enforced by configureCameraSchema at the configure gate), and streaming
  // paths only ever run for CONFIGURED cameras — so a null here means a DRAFT
  // camera slipped through. Surface it as a clean InvalidRtspUrlError (fixed
  // reason string, never leaks the URL) *before* any streamSession row exists.
  if (encryptedUrl == null) throw new InvalidRtspUrlError('missing-url');
  const rawUrl = normalizeRtspUrl(decrypt(encryptedUrl));
  const username = camera.rtspUsernameEncrypted ? decrypt(camera.rtspUsernameEncrypted) : '';
  const password = camera.rtspPasswordEncrypted ? decrypt(camera.rtspPasswordEncrypted) : '';
  return injectRtspCredentials(rawUrl, username, password);
}

// ─── MediaMTX control plane ──────────────────────────────────────────────────

function mtxPathUrl(action: 'add' | 'delete', mediamtxPath: string): string {
  // MediaMTX accepts slash-nested path names literally after the action verb;
  // segments are already URL-safe (scheme-free cameraCode + uuid), so no
  // encoding — encoding the slashes would break the route.
  return `${env.MEDIAMTX_API_URL}/v3/config/paths/${action}/${mediamtxPath}`;
}

/**
 * The Live Wall (LIVE_SUB) must always be playable in the browser, so any sub
 * stream whose codec is not browser-playable is transcoded to H.264 on demand.
 * The full-res main stream is deliberately left as-is (it may stay HEVC per ops
 * policy) — only the wall's sub tile is touched.
 *
 * DETECTION-AUTHORITATIVE: the decision is driven by `detectedSubCodec` — what
 * the health probe actually measured on the sub stream with ffprobe — NEVER by
 * the operator-declared `expectedCodec`, which is routinely wrong for HEVC/H.265
 * cameras and is exactly how HEVC tiles reached the wall un-transcoded. Codec
 * spellings are normalized before comparison (ffprobe emits 'H264'/'HEVC', the
 * form stores 'H.264'), and `isBrowserPlayableCodec` FAILS SAFE: a null /
 * undetected / unknown codec is treated as not playable, so a camera the probe
 * has not reached yet transcodes (and plays) rather than shipping a dead tile.
 */
function needsH264Transcode(camera: Camera, kind: StreamKind): boolean {
  return kind === 'LIVE_SUB' && !isBrowserPlayableCodec(camera.detectedSubCodec);
}

/**
 * Command MediaMTX runs on demand: pull the (HEVC) camera source, transcode to
 * H.264 and republish it back into this same path. MediaMTX splits the command
 * on spaces and substitutes $RTSP_PORT/$MTX_PATH itself — there is no shell, so
 * no argument may contain a space (RTSP URLs never do). Audio is dropped and the
 * tile is downscaled to 360p to keep a full wall of concurrent transcodes cheap.
 */
function transcodeCommand(source: string): string {
  return [
    'ffmpeg -nostdin -loglevel warning',
    // Source pull uses TCP-first with UDP fallback (see health.checkers.ts) so an
    // HEVC camera whose media only survives over UDP still transcodes, instead of a
    // hard `-rtsp_transport tcp` with no fallback. A single ffmpeg process, so the
    // native ladder works inside this MediaMTX runOnDemand command string (no shell).
    // The publish side below stays TCP — it targets localhost MediaMTX and is reliable.
    '-rtsp_flags prefer_tcp -i',
    source,
    '-an',
    '-c:v libx264 -preset ultrafast -tune zerolatency -profile:v baseline -pix_fmt yuv420p -g 48',
    '-vf scale=-2:360 -b:v 800k -maxrate 800k -bufsize 1600k',
    '-f rtsp -rtsp_transport tcp rtsp://localhost:$RTSP_PORT/$MTX_PATH',
  ].join(' ');
}

/**
 * MediaMTX path config: a cheap on-demand RTSP pull for browser-playable
 * sources, or an on-demand ffmpeg transcode when the source codec cannot be
 * decoded in the browser (see needsH264Transcode).
 */
function buildPathConfig(
  camera: Camera,
  kind: StreamKind,
  source: string
): Record<string, unknown> {
  if (needsH264Transcode(camera, kind)) {
    return {
      runOnDemand: transcodeCommand(source),
      runOnDemandRestart: true,
      runOnDemandStartTimeout: '15s',
      runOnDemandCloseAfter: '10s',
    };
  }
  return { source, sourceOnDemand: true };
}

/**
 * Registers an on-demand stream for the session's camera on MediaMTX. Cheap
 * H.264 sources are dialed lazily via sourceOnDemand; HEVC sub streams are
 * transcoded to H.264 on demand (see buildPathConfig) so the Live Wall plays in
 * the browser. Either way this returns as soon as the path config is accepted;
 * the camera's own reachability then surfaces to the browser via the HLS player.
 */
export async function publishStream(
  mediamtxPath: string,
  camera: Camera,
  kind: StreamKind
): Promise<void> {
  if (env.PLAYBACK_SIM_MODE) return;

  const source = resolveCameraSource(camera, kind);
  const res = await fetch(mtxPathUrl('add', mediamtxPath), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPathConfig(camera, kind, source)),
  }).catch((err: unknown) => {
    logger.error('MediaMTX publish failed (control API unreachable)', {
      mediamtxPath,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error('Live stream backend (MediaMTX) is unreachable');
  });

  // MediaMTX returns 400 if the path name already exists. Our path carries a
  // per-session UUID (effectively unique), so a 400 means a benign re-add.
  if (!res.ok && res.status !== 400) {
    logger.error('MediaMTX rejected the camera source', {
      mediamtxPath,
      status: res.status,
    });
    throw new Error(`Live stream backend rejected the camera source (HTTP ${res.status})`);
  }

  logger.info('MediaMTX path published', {
    mediamtxPath,
    kind,
    transcoded: needsH264Transcode(camera, kind),
  });
}

/**
 * Removes the session's MediaMTX path. Best-effort: a failed delete (path
 * already gone, MediaMTX down) must never block ending a session.
 */
export async function teardownStream(mediamtxPath: string): Promise<void> {
  if (env.PLAYBACK_SIM_MODE) return;

  await fetch(mtxPathUrl('delete', mediamtxPath), { method: 'DELETE' }).catch((err: unknown) => {
    logger.warn('MediaMTX teardown failed (ignored)', {
      mediamtxPath,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}
