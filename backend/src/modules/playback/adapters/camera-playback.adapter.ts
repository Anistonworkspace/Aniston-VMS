import { env } from '../../../config/env.js';
import { buildMediamtxPath, buildStreamEndpoints } from '../mediamtx.adapter.js';
import type { StreamEndpoints, StreamKind } from '../mediamtx.adapter.js';

// ─────────────────────────────────────────────────────────────────────────────
// CR-12 — vendor playback adapter layer (docs/06-implementation-plan.md §CR-12:
// "CameraPlaybackAdapter + Onvif/Hikvision/Dahua impls compile (SIM
// functional, stubs OK)").
//
// The MediaMTX adapter (../mediamtx.adapter.ts) answers "where do *our* proxy
// streams live". This layer answers the vendor-specific half: "how do we ask
// the camera/NVR itself for recorded footage". Each vendor implementation is
// a deterministic URI/segment builder:
//   • SIM mode (PLAYBACK_SIM_MODE=true, the default here) is fully functional
//     — recording segments are synthesized hour-aligned and playback
//     endpoints resolve through the MediaMTX sim path builders.
//   • Real mode methods still compile and return the correct vendor URI
//     *shapes* (Hikvision ISAPI track URIs, Dahua playback URIs, ONVIF
//     ReplayUri placeholders) — wiring live HTTP/ONVIF calls is a Phase-2
//     task, mirroring the TODO(real adapter) note in mediamtx.adapter.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors prisma enum `PlaybackAdapter` (ONVIF_G | HIKVISION | DAHUA | NONE). */
export type PlaybackAdapterKind = 'ONVIF_G' | 'HIKVISION' | 'DAHUA' | 'NONE';

/** Minimal structural camera shape — keeps this layer decoupled from Prisma. */
export interface AdapterCamera {
  cameraCode: string;
  /** Decrypted main-stream RTSP URL (camera.service handles decryption). */
  mainRtspUrl?: string | null;
  onvifPort?: number | null;
  channel?: number | null;
}

export interface RecordingSegment {
  start: Date;
  end: Date;
  /** Vendor-native URI for the segment (SIM: deterministic sim:// URI). */
  uri: string;
}

export interface AdapterCapabilities {
  vendor: PlaybackAdapterKind;
  /** True when recorded-footage queries are supported by this adapter. */
  supportsRecordingQuery: boolean;
  /** True when seek-while-playing (absolute timestamp seek) is supported. */
  supportsAbsoluteSeek: boolean;
  /** Human string shown in diagnostics / SOP docs. */
  notes: string;
}

export interface CameraPlaybackAdapter {
  readonly vendor: PlaybackAdapterKind;
  describe(): AdapterCapabilities;
  /**
   * Vendor-native playback URI for a time range (what an NVR/DVR would be
   * asked to replay). Pure string builder — never performs I/O.
   */
  buildVendorPlaybackUri(camera: AdapterCamera, start: Date, end: Date): string;
  /**
   * Recorded segments intersecting [start, end]. SIM mode synthesizes
   * hour-aligned segments deterministically; real mode is a Phase-2 stub that
   * resolves to an empty list (compiles, no network).
   */
  listRecordingSegments(camera: AdapterCamera, start: Date, end: Date): Promise<RecordingSegment[]>;
  /**
   * Our proxy endpoints for playing this camera back through MediaMTX —
   * always functional (delegates to mediamtx.adapter path builders).
   */
  buildProxyEndpoints(camera: AdapterCamera, sessionId: string, kind?: StreamKind): StreamEndpoints;
}

/** Host (ip[:port]) extracted from an rtsp:// URL, with a sim fallback. */
export function rtspHost(camera: AdapterCamera): string {
  const raw = camera.mainRtspUrl ?? '';
  const match = /^rtsps?:\/\/(?:[^@/]+@)?([^/]+)/i.exec(raw);
  return match?.[1] ?? `sim-${camera.cameraCode}.local`;
}

/** Compact vendor timestamp — yyyymmddThhmmssZ (UTC), shared by impls. */
export function vendorTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

/**
 * SIM recording synthesis — hour-aligned segments covering [start, end],
 * deterministic for a given camera + range (drills/tests rely on this).
 */
export function simRecordingSegments(
  camera: AdapterCamera,
  start: Date,
  end: Date,
  vendor: PlaybackAdapterKind
): RecordingSegment[] {
  if (end <= start) return [];
  const segments: RecordingSegment[] = [];
  const HOUR = 3_600_000;
  let cursor = Math.floor(start.getTime() / HOUR) * HOUR;
  while (cursor < end.getTime() && segments.length < 1000) {
    const segStart = new Date(Math.max(cursor, start.getTime()));
    const segEnd = new Date(Math.min(cursor + HOUR, end.getTime()));
    segments.push({
      start: segStart,
      end: segEnd,
      uri: `sim://${vendor.toLowerCase()}/${camera.cameraCode}/${vendorTimestamp(segStart)}-${vendorTimestamp(segEnd)}`,
    });
    cursor += HOUR;
  }
  return segments;
}

/** Shared proxy-endpoint builder — all vendors play back through MediaMTX. */
export function proxyEndpoints(
  camera: AdapterCamera,
  sessionId: string,
  kind: StreamKind = 'PLAYBACK'
): StreamEndpoints {
  return buildStreamEndpoints(buildMediamtxPath(camera.cameraCode, kind, sessionId));
}

export function isSimMode(): boolean {
  return env.PLAYBACK_SIM_MODE;
}
