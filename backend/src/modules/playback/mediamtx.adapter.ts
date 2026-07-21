import type { Camera } from '@prisma/client';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
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

const RTSP_SCHEME_RE = /^(rtsps?:\/\/)/i;
// rtsp://user:pass@host — credentials already in the URL userinfo.
const HAS_USERINFO_RE = /^rtsps?:\/\/[^/@]+@/i;
// Some ONVIF/Hikvision variants embed creds in the path (…/user=x_password=y).
const EMBEDS_CREDS_RE = /(?:user|usr|password|pwd)=/i;

/**
 * Some camera URLs were captured/stored with an HTML-encoded ampersand
 * (`…stream=0&amp;onvif=0…`) — a form/import artifact that is never valid in a
 * real RTSP URL. ffmpeg/MediaMTX would otherwise receive a malformed query and
 * fail to open the input. Normalize it back to a literal `&`. Targeted to the
 * `&amp;` entity only (collapsing any accidental double-encoding); deliberately
 * NOT a general HTML-entity decode, so genuine URL characters are untouched.
 */
function normalizeRtspUrl(rawUrl: string): string {
  return rawUrl.replace(/&(?:amp;)+/gi, '&');
}

/**
 * Injects the decrypted username/password into a bare `rtsp://host/…` URL.
 * Left untouched when the URL already carries credentials (userinfo or
 * path-embedded) or when no username is stored, so cameras whose whole
 * credentialed URL was pasted into the form keep working verbatim.
 */
function withCredentials(rawUrl: string, username: string, password: string): string {
  if (!username || HAS_USERINFO_RE.test(rawUrl) || EMBEDS_CREDS_RE.test(rawUrl)) return rawUrl;
  return rawUrl.replace(
    RTSP_SCHEME_RE,
    `$1${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
  );
}

/**
 * Decrypts the camera's stored RTSP URL for the requested kind (sub-stream for
 * LIVE_SUB, main otherwise) and returns a fully-credentialed source URL that
 * MediaMTX can pull from. Never logged — it contains the camera password.
 */
export function resolveCameraSource(camera: Camera, kind: StreamKind): string {
  const encryptedUrl =
    kind === 'LIVE_SUB' ? camera.subRtspUrlEncrypted : camera.mainRtspUrlEncrypted;
  const rawUrl = normalizeRtspUrl(decrypt(encryptedUrl));
  const username = camera.rtspUsernameEncrypted ? decrypt(camera.rtspUsernameEncrypted) : '';
  const password = camera.rtspPasswordEncrypted ? decrypt(camera.rtspPasswordEncrypted) : '';
  return withCredentials(rawUrl, username, password);
}

// ─── MediaMTX control plane ──────────────────────────────────────────────────

function mtxPathUrl(action: 'add' | 'delete', mediamtxPath: string): string {
  // MediaMTX accepts slash-nested path names literally after the action verb;
  // segments are already URL-safe (scheme-free cameraCode + uuid), so no
  // encoding — encoding the slashes would break the route.
  return `${env.MEDIAMTX_API_URL}/v3/config/paths/${action}/${mediamtxPath}`;
}

// Browsers decode H.264 over MediaMTX's HLS/WebRTC output; HEVC/H.265 (and
// anything else a camera might emit) will not play. Pass-through is only safe
// for codecs in this set.
const BROWSER_PLAYABLE_CODECS = new Set(['H.264']);

/**
 * The Live Wall (LIVE_SUB) must always be playable in the browser, so any
 * non-H.264 sub source is transcoded to H.264 on demand. The full-res main
 * stream is deliberately left as-is (it may stay HEVC per ops policy) — only
 * the wall's sub tile is touched.
 */
function needsH264Transcode(camera: Camera, kind: StreamKind): boolean {
  return kind === 'LIVE_SUB' && !BROWSER_PLAYABLE_CODECS.has(camera.expectedCodec);
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
    '-rtsp_transport tcp -i',
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
