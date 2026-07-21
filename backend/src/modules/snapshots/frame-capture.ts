import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { Camera, SnapshotKind } from '@prisma/client';
import { decode, encode } from 'jpeg-js';
import { env } from '../../config/env.js';
import { AppError } from '../../middleware/errorHandler.js';
import { resolveCameraSource } from '../playback/mediamtx.adapter.js';

// ─────────────────────────────────────────────────────────────────────────────
// Frame capture. This module produces the ACTUAL image bytes for a snapshot.
//
// Root cause of CAM-007 ("Capture snapshot" succeeds but cards show no image,
// and the file endpoint renders black with a tiny white dot): the service used
// to write a hardcoded 1×1 baseline JPEG (`BASE_JPEG`) for every capture — a
// valid JPEG, so nothing errored, but a 1×1 pixel scaled up to a card is just
// black/gray with a speck. No frame was ever pulled from the camera.
//
// captureFrameFromCamera() shells out to ffmpeg to grab one real frame off the
// camera's RTSP main stream, then validates it decodes to real (>1×1)
// dimensions before it can be stored. generateSyntheticFrame() produces a
// real-dimension placeholder ONLY when SNAPSHOT_SIM_MODE is explicitly enabled
// (hermetic dev/test with no cameras) — it is never the default path.
// ─────────────────────────────────────────────────────────────────────────────

export interface CapturedFrame {
  /** Full-resolution JPEG bytes. */
  original: Buffer;
  /** Downscaled JPEG for card/strip rendering. */
  thumbnail: Buffer;
  width: number;
  height: number;
}

/**
 * Capture failure. 502 Bad Gateway: the fault is upstream (camera unreachable,
 * RTSP auth, ffmpeg missing/erroring), not the API caller's request. Surfacing
 * this instead of silently writing a placeholder is the whole point of the fix —
 * a failed capture must be an honest error, never a fake-success record.
 */
export class SnapshotCaptureError extends AppError {
  constructor(message: string, details?: unknown) {
    super('SNAPSHOT_CAPTURE_FAILED', 502, message, details);
  }
}

const THUMB_MAX_DIM = 320;
const FULL_QUALITY = 82;
const THUMB_QUALITY = 70;

interface RgbaImage {
  data: Buffer;
  width: number;
  height: number;
}

/**
 * Strip RTSP credentials from any text before it reaches logs or error details.
 * resolveCameraSource injects `rtsp://user:pass@host`, and ffmpeg echoes the
 * input URL in its stderr, so the userinfo must be redacted from anything we
 * propagate.
 */
export function redactRtsp(text: string): string {
  return text.replace(/(rtsps?:\/\/)[^/@\s]*@/gi, '$1***@');
}

/**
 * Spawn ffmpeg to pull a single frame off the RTSP stream and return the raw
 * JPEG bytes from stdout. Mirrors the ffprobe conventions in health.checkers
 * (windowsHide, SIGKILL on timeout, ENOENT = hard failure). Never resolves with
 * an empty/partial buffer — callers get a real JPEG or a SnapshotCaptureError.
 */
export function runFfmpegCapture(
  rtspUrl: string,
  timeoutMs: number = env.SNAPSHOT_CAPTURE_TIMEOUT_MS
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const args = [
      '-nostdin',
      '-loglevel',
      'error',
      '-rtsp_transport',
      'tcp',
      '-i',
      rtspUrl,
      '-an',
      '-frames:v',
      '1',
      '-q:v',
      '3',
      '-f',
      'mjpeg',
      'pipe:1',
    ];
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;
    const proc = spawn(env.FFMPEG_PATH, args, { windowsHide: true });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill('SIGKILL');
      reject(new SnapshotCaptureError('Frame capture timed out'));
    }, timeoutMs);

    proc.stdout.on('data', (d: Buffer) => stdout.push(d));
    proc.stderr.on('data', (d: Buffer) => stderr.push(d));

    proc.once('error', (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Fail closed. A missing/broken ffmpeg binary must never yield a
      // "successful" empty capture — real frames are mandatory.
      const missing = err.code === 'ENOENT';
      reject(
        new SnapshotCaptureError(
          missing
            ? 'ffmpeg binary not found — snapshot frame could not be captured'
            : `ffmpeg failed to start: ${err.message}`
        )
      );
    });

    proc.once('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const frame = Buffer.concat(stdout);
      if (code !== 0 || frame.length === 0) {
        const detail = redactRtsp(Buffer.concat(stderr).toString('utf8').trim());
        reject(
          new SnapshotCaptureError(
            `ffmpeg exited ${code ?? 'null'} without producing a frame`,
            detail ? { stderr: detail.slice(0, 500) } : undefined
          )
        );
        return;
      }
      resolve(frame);
    });
  });
}

/**
 * Decode a JPEG and assert it is a real image. Throws SnapshotCaptureError if
 * the bytes are undecodable or have degenerate (≤1px) dimensions — the exact
 * signature of the old 1×1 BASE_JPEG placeholder. This is the guard that turns
 * "silently wrong image" into a loud failure.
 */
export function decodeAndValidate(jpeg: Buffer): RgbaImage {
  let raw: { width: number; height: number; data: Uint8Array } | undefined;
  try {
    raw = decode(jpeg, { useTArray: true, maxResolutionInMP: 200 });
  } catch (err) {
    throw new SnapshotCaptureError('Captured frame is not a decodable JPEG', {
      cause: String(err),
    });
  }
  if (!raw || raw.width < 2 || raw.height < 2) {
    throw new SnapshotCaptureError(
      `Captured frame has non-image dimensions ${raw?.width ?? 0}×${raw?.height ?? 0}`
    );
  }
  return { data: Buffer.from(raw.data), width: raw.width, height: raw.height };
}

/** Nearest-neighbour downscale of RGBA data, capped at `maxDim` on the long edge. */
function downscaleRgba(src: RgbaImage, maxDim: number): RgbaImage {
  const scale = Math.min(1, maxDim / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  if (w === src.width && h === src.height) return src;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(src.height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.width - 1, Math.floor(x / scale));
      const si = (sy * src.width + sx) * 4;
      const di = (y * w + x) * 4;
      out[di] = src.data[si];
      out[di + 1] = src.data[si + 1];
      out[di + 2] = src.data[si + 2];
      out[di + 3] = src.data[si + 3];
    }
  }
  return { data: out, width: w, height: h };
}

function encodeJpeg(img: RgbaImage, quality: number): Buffer {
  return Buffer.from(encode({ data: img.data, width: img.width, height: img.height }, quality).data);
}

/**
 * Pull one real frame from the camera's main RTSP stream and return the
 * validated full-resolution JPEG plus a generated thumbnail. Throws
 * SnapshotCaptureError on any capture/validation failure.
 */
export async function captureFrameFromCamera(camera: Camera): Promise<CapturedFrame> {
  const rtspUrl = resolveCameraSource(camera, 'LIVE_MAIN');
  const jpeg = await runFfmpegCapture(rtspUrl);
  const full = decodeAndValidate(jpeg);
  const thumbnail = encodeJpeg(downscaleRgba(full, THUMB_MAX_DIM), THUMB_QUALITY);
  // Keep the camera's native JPEG as the full-res original (best fidelity); only
  // the thumbnail is re-encoded.
  return { original: jpeg, thumbnail, width: full.width, height: full.height };
}

/**
 * Deterministic, real-dimension synthetic frame for SNAPSHOT_SIM_MODE only.
 * Seeded by camera + kind + timestamp so every capture is visibly unique and —
 * unlike the old 1×1 stub — decodes to genuine dimensions and renders as an
 * actual image on a card.
 */
export function generateSyntheticFrame(
  camera: Camera,
  kind: SnapshotKind,
  at: Date
): CapturedFrame {
  const width = 640;
  const height = 360;
  const seed = createHash('sha256')
    .update(`${camera.id}|${kind}|${at.toISOString()}`)
    .digest();
  const r0 = seed[0];
  const g0 = seed[1];
  const b0 = seed[2];
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (r0 + Math.floor((x * 255) / width)) & 0xff;
      data[i + 1] = (g0 + Math.floor((y * 255) / height)) & 0xff;
      data[i + 2] = (b0 + Math.floor(((x + y) * 255) / (width + height))) & 0xff;
      data[i + 3] = 255;
    }
  }
  const full: RgbaImage = { data, width, height };
  return {
    original: encodeJpeg(full, FULL_QUALITY),
    thumbnail: encodeJpeg(downscaleRgba(full, THUMB_MAX_DIM), THUMB_QUALITY),
    width,
    height,
  };
}
