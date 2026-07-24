import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import type { Camera } from '@prisma/client';
import { decode, encode } from 'jpeg-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('../playback/mediamtx.adapter.js', () => ({
  resolveCameraSource: vi.fn(() => 'rtsp://admin:s3cr3t@cam.local/main'),
}));

import {
  SnapshotCaptureError,
  captureFrameFromCamera,
  decodeAndValidate,
  generateSyntheticFrame,
  redactRtsp,
  runFfmpegCapture,
} from './frame-capture.js';
import { resolveCameraSource } from '../playback/mediamtx.adapter.js';

const spawnMock = vi.mocked(spawn);

// The EXACT 1×1 placeholder that snapshot.service used to write for every
// capture (CAM-007 root cause). Kept here as a regression fixture.
const OLD_1x1_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==',
  'base64'
);

function realJpeg(width: number, height: number): Buffer {
  const data = Buffer.alloc(width * height * 4, 128);
  return Buffer.from(encode({ data, width, height }, 80).data);
}

interface FakeProc extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

function fakeProc(): FakeProc {
  const proc = new EventEmitter() as FakeProc;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  return proc;
}

const camera = { id: 'cam-1', cameraCode: 'CAM-001' } as unknown as Camera;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('decodeAndValidate — rejects the degenerate placeholder', () => {
  it('throws on the old 1×1 BASE_JPEG (the CAM-007 regression)', () => {
    expect(() => decodeAndValidate(OLD_1x1_JPEG)).toThrow(SnapshotCaptureError);
    expect(() => decodeAndValidate(OLD_1x1_JPEG)).toThrow(/non-image dimensions/i);
  });

  it('throws on undecodable bytes', () => {
    expect(() => decodeAndValidate(Buffer.from('not a jpeg'))).toThrow(SnapshotCaptureError);
  });

  it('accepts a real frame and returns its true dimensions', () => {
    const img = decodeAndValidate(realJpeg(640, 360));
    expect(img.width).toBe(640);
    expect(img.height).toBe(360);
  });
});

describe('redactRtsp', () => {
  it('strips credentials from RTSP URLs', () => {
    const out = redactRtsp("Opening 'rtsp://admin:s3cr3t@cam.local/main' for reading");
    expect(out).not.toContain('s3cr3t');
    expect(out).not.toContain('admin:');
    expect(out).toContain('rtsp://***@cam.local/main');
  });

  it('strips credentials embedded as Dahua/Hik query params (no userinfo @)', () => {
    // The real leak: creds are `key=value` in the PATH, there is no `user:pass@`.
    const url =
      'rtsp://192.0.2.10:554/user=admin_password=pAsSw0rd9_channel=1_stream=0&onvif=0.sdp';
    const out = redactRtsp(`method DESCRIBE failed: 401 Unauthorized for '${url}'`);

    // secrets are gone, in every representation
    expect(out).not.toContain('pAsSw0rd9');
    expect(out).not.toContain('user=admin');
    expect(out).toContain('user=***');
    expect(out).toContain('password=***');

    // useful ffmpeg diagnostics + non-secret fields survive
    expect(out).toContain('DESCRIBE');
    expect(out).toContain('401 Unauthorized');
    expect(out).toContain('channel=1');
    expect(out).toContain('192.0.2.10');
  });

  it('redacts standard ?query credentials and preserves neighbours', () => {
    const out = redactRtsp(
      'rtsp://cam/stream?username=root&password=hunter2&token=abc.def&resolution=1080p'
    );
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('abc.def');
    expect(out).toContain('username=***');
    expect(out).toContain('password=***');
    expect(out).toContain('token=***');
    expect(out).toContain('resolution=1080p'); // non-secret field kept
  });

  it('redacts Authorization headers and bearer tokens (HTTP-reachable cams)', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.cGF5bG9hZA.c2lnbmF0dXJl';
    const out = redactRtsp(`GET /snapshot [401]: Authorization: Bearer ${jwt}`);
    expect(out).not.toContain(jwt);
    expect(out).toContain('***');
    expect(out).toContain('401'); // diagnostic status preserved
  });

  it('leaves credential-free diagnostics untouched', () => {
    const clean = 'ffmpeg exited 8: method DESCRIBE failed: 454 Session Not Found';
    expect(redactRtsp(clean)).toBe(clean);
  });
});

describe('generateSyntheticFrame (SIM mode only)', () => {
  it('produces a real-dimension, decodable image with a smaller thumbnail', () => {
    const frame = generateSyntheticFrame(camera, 'SUB', new Date('2026-02-01T00:00:00Z'));
    const full = decode(frame.original, { useTArray: true });
    const thumb = decode(frame.thumbnail, { useTArray: true });
    expect(full.width).toBe(640);
    expect(full.height).toBe(360);
    expect(thumb.width).toBeGreaterThan(1);
    expect(Math.max(thumb.width, thumb.height)).toBeLessThanOrEqual(320);
    expect(thumb.width).toBeLessThan(full.width);
  });

  it('is deterministic for identical inputs and unique across captures', () => {
    const at = new Date('2026-02-01T00:00:00Z');
    const a = generateSyntheticFrame(camera, 'SUB', at);
    const b = generateSyntheticFrame(camera, 'SUB', at);
    const laterTime = generateSyntheticFrame(camera, 'SUB', new Date('2026-02-01T00:15:00Z'));
    const otherCam = generateSyntheticFrame(
      { id: 'cam-2', cameraCode: 'CAM-002' } as unknown as Camera,
      'SUB',
      at
    );
    expect(a.original.equals(b.original)).toBe(true);
    expect(a.original.equals(laterTime.original)).toBe(false);
    expect(a.original.equals(otherCam.original)).toBe(false);
  });
});

describe('runFfmpegCapture', () => {
  it('resolves with the JPEG bytes on a clean exit', async () => {
    const proc = fakeProc();
    spawnMock.mockReturnValue(proc as never);
    const jpeg = realJpeg(320, 240);

    const p = runFfmpegCapture('rtsp://cam/main', 5000);
    proc.stdout.emit('data', jpeg);
    proc.emit('close', 0);

    await expect(p).resolves.toEqual(jpeg);
  });

  // Regression guard for the ffmpeg 8.x "-rw_timeout" outage: the RTSP demuxer
  // rejects -rw_timeout ("Option rw_timeout not found") and exits 8 before opening
  // the stream, so EVERY capture failed. The demuxer socket-I/O AVOption is
  // -timeout, and it takes MICROSECONDS (env value is milliseconds).
  it('spawns ffmpeg with -timeout (microseconds), never the removed -rw_timeout', async () => {
    const proc = fakeProc();
    spawnMock.mockReturnValue(proc as never);

    const p = runFfmpegCapture('rtsp://cam/main', 5000);
    proc.stdout.emit('data', realJpeg(320, 240));
    proc.emit('close', 0);
    await p;

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain('-timeout');
    expect(args).not.toContain('-rw_timeout');
    // microsecond conversion: 5000 ms -> "5000000"
    expect(args[args.indexOf('-timeout') + 1]).toBe('5000000');
  });

  it('rejects (502) and redacts credentials when ffmpeg exits non-zero', async () => {
    const proc = fakeProc();
    spawnMock.mockReturnValue(proc as never);

    const p = runFfmpegCapture('rtsp://admin:s3cr3t@cam/main', 5000);
    proc.stderr.emit('data', Buffer.from('rtsp://admin:s3cr3t@cam/main: Connection refused'));
    proc.emit('close', 1);

    const err = await p.catch((e) => e);
    expect(err).toBeInstanceOf(SnapshotCaptureError);
    expect(err.statusCode).toBe(502);
    expect(JSON.stringify(err.details ?? '')).not.toContain('s3cr3t');
  });

  it('rejects with a clear message when the ffmpeg binary is missing', async () => {
    const proc = fakeProc();
    spawnMock.mockReturnValue(proc as never);

    const p = runFfmpegCapture('rtsp://cam/main', 5000);
    proc.emit('error', Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' }));

    await expect(p).rejects.toThrow(/ffmpeg binary not found/i);
  });

  it('kills the process and rejects on timeout', async () => {
    const proc = fakeProc();
    spawnMock.mockReturnValue(proc as never);

    const p = runFfmpegCapture('rtsp://cam/main', 15); // never emits close
    const err = await p.catch((e) => e);
    expect(err).toBeInstanceOf(SnapshotCaptureError);
    expect(err.message).toMatch(/timed out/i);
    expect(proc.kill).toHaveBeenCalled();
  });

  it('rejects when ffmpeg exits 0 but produced no frame', async () => {
    const proc = fakeProc();
    spawnMock.mockReturnValue(proc as never);

    const p = runFfmpegCapture('rtsp://cam/main', 5000);
    proc.emit('close', 0); // no stdout data

    await expect(p).rejects.toThrow(SnapshotCaptureError);
  });
});

describe('captureFrameFromCamera', () => {
  it('captures, validates, and returns a full frame + thumbnail', async () => {
    const proc = fakeProc();
    spawnMock.mockReturnValue(proc as never);
    const jpeg = realJpeg(1280, 720);

    const p = captureFrameFromCamera(camera);
    proc.stdout.emit('data', jpeg);
    proc.emit('close', 0);

    const frame = await p;
    expect(resolveCameraSource).toHaveBeenCalledWith(camera, 'LIVE_MAIN');
    expect(frame.original).toEqual(jpeg);
    expect(frame.width).toBe(1280);
    expect(frame.height).toBe(720);
    const thumb = decode(frame.thumbnail, { useTArray: true });
    expect(Math.max(thumb.width, thumb.height)).toBeLessThanOrEqual(320);
  });

  it('rejects when the captured frame is a 1×1 placeholder', async () => {
    const proc = fakeProc();
    spawnMock.mockReturnValue(proc as never);

    const p = captureFrameFromCamera(camera);
    proc.stdout.emit('data', OLD_1x1_JPEG);
    proc.emit('close', 0);

    await expect(p).rejects.toThrow(SnapshotCaptureError);
  });
});
