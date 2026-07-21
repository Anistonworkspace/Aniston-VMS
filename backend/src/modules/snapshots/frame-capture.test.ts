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

  it('rejects (502) and redacts credentials when ffmpeg exits non-zero', async () => {
    const proc = fakeProc();
    spawnMock.mockReturnValue(proc as never);

    const p = runFfmpegCapture('rtsp://admin:s3cr3t@cam/main', 5000);
    proc.stderr.emit(
      'data',
      Buffer.from("rtsp://admin:s3cr3t@cam/main: Connection refused")
    );
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
