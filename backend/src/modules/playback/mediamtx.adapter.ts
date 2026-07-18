import { env } from '../../config/env.js';

// ─────────────────────────────────────────────────────────────────────────────
// Thin MediaMTX adapter. Every module that needs live/playback stream URLs
// goes through here instead of building MediaMTX paths inline, so swapping
// PLAYBACK_SIM_MODE=false in a real deployment only touches this file.
//
// SIM_MODE branch mirrors the established pattern in
// modules/health/health.checkers.ts (HEALTH_SIM_MODE) and
// modules/snapshots/snapshot.service.ts (simJpeg): when PLAYBACK_SIM_MODE is
// true (the default in this environment — there is no real MediaMTX/ffmpeg
// reachable), we synthesize deterministic path + URL strings instead of
// talking to MediaMTX. When false, we build the *same shape* of URLs against
// the real MEDIAMTX_* base envs — this is still just string-building, no
// live HTTP call is made (see publishStream/teardownStream TODOs below).
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

/** Rebuilds the URL trio for an already-known mediamtxPath (e.g. on reconnect/poll). */
export function buildStreamEndpoints(mediamtxPath: string): StreamEndpoints {
  return {
    mediamtxPath,
    hlsUrl: `${env.MEDIAMTX_HLS_URL}/${mediamtxPath}/index.m3u8`,
    webrtcUrl: `${env.MEDIAMTX_WEBRTC_URL}/${mediamtxPath}/whep`,
    rtspUrl: `${env.MEDIAMTX_RTSP_URL}/${mediamtxPath}`,
  };
}

// TODO(real adapter, PLAYBACK_SIM_MODE=false): a future stage should have
// publishStream() call the MediaMTX control API (MEDIAMTX_API_URL) —
// POST /v3/config/paths/add/{mediamtxPath} — configuring an on-demand
// ffmpeg pull from the camera's decrypted main/sub RTSP URL
// (mainRtspUrlEncrypted/subRtspUrlEncrypted + rtspUsernameEncrypted/
// rtspPasswordEncrypted on the Camera row), then poll
// GET /v3/paths/list until the path reports `ready: true` before handing the
// URLs back to the client. teardownStream() would mirror that with
// DELETE /v3/config/paths/delete/{mediamtxPath}. Neither makes a network call
// today — wiring the camera credential decryption + real HTTP client is out
// of scope for this stage; both are safe, awaitable no-ops so the rest of the
// session lifecycle (create/heartbeat/end/reap) can be exercised end to end
// regardless of PLAYBACK_SIM_MODE.

export async function publishStream(mediamtxPath: string): Promise<void> {
  void mediamtxPath;
  void env.MEDIAMTX_API_URL;
}

export async function teardownStream(mediamtxPath: string): Promise<void> {
  void mediamtxPath;
  void env.MEDIAMTX_API_URL;
}
