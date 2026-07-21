import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// Each ffprobeStream() call gets a fake child process we can drive to emit
// 'error' — ENOENT (binary missing) or any other spawn failure.
const spawnMock = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));
// health.checkers eagerly imports lib/redis (ioredis, lazyConnect:false) — stub it.
vi.mock('../../lib/redis.js', () => ({ redis: {} }));

import { ffprobeStream } from './health.checkers.js';

function fakeProc() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdout = new EventEmitter();
  proc.kill = vi.fn();
  return proc;
}

describe('ffprobeStream — fail closed on binary problems', () => {
  beforeEach(() => spawnMock.mockReset());

  it('reports success:false / FFPROBE_MISSING when ffprobe is not installed (ENOENT)', async () => {
    const proc = fakeProc();
    spawnMock.mockReturnValue(proc);

    // .once('error') is registered synchronously inside the Promise executor.
    const pending = ffprobeStream('rtsp://10.20.40.11:554/stream1');
    proc.emit('error', Object.assign(new Error('spawn ffprobe ENOENT'), { code: 'ENOENT' }));

    const res = await pending;
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('FFPROBE_MISSING');
    expect(res.errorMessage).toMatch(/ffprobe binary not found/i);
  });

  it('reports success:false / FFPROBE_ERROR on other spawn failures', async () => {
    const proc = fakeProc();
    spawnMock.mockReturnValue(proc);

    const pending = ffprobeStream('rtsp://10.20.40.11:554/stream1');
    proc.emit('error', Object.assign(new Error('boom'), { code: 'EPIPE' }));

    const res = await pending;
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('FFPROBE_ERROR');
    expect(res.errorMessage).toBe('boom');
  });
});
