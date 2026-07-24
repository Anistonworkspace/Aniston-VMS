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

// Fake RTSP socket: each new net.Socket().connect() delivers the next queued
// raw RTSP response, or a synthetic '__TIMEOUT__' / '__ERROR__' event. Named
// with a `mock` prefix so it survives vi.mock hoisting.
const mockRtspQueue: string[] = [];
vi.mock('node:net', async () => {
  const { EventEmitter } = await import('node:events');
  class FakeSocket extends EventEmitter {
    setTimeout(): void {}
    write(): void {}
    destroy(): void {}
    connect(_port: number, _host: string, cb?: () => void): void {
      cb?.();
      queueMicrotask(() => {
        const next = mockRtspQueue.shift() ?? 'RTSP/1.0 500 Internal\r\n\r\n';
        if (next === '__TIMEOUT__') return void this.emit('timeout');
        if (next === '__ERROR__')
          return void this.emit('error', Object.assign(new Error('reset'), { code: 'ECONNRESET' }));
        this.emit('data', Buffer.from(next));
      });
    }
  }
  return { default: { Socket: FakeSocket } };
});

import { ffprobeStream, rtspDescribe } from './health.checkers.js';

function fakeProc() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
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

  // Regression guard: ffmpeg/ffprobe 8.x removed -rw_timeout from the RTSP demuxer.
  // The health probe must spawn ffprobe with -timeout (microseconds), never the
  // removed flag — otherwise every camera reads CRITICAL with a bogus reason.
  it('spawns ffprobe with -timeout (microseconds), never the removed -rw_timeout', async () => {
    const proc = fakeProc();
    spawnMock.mockReturnValue(proc);

    const pending = ffprobeStream('rtsp://10.20.40.11:554/stream1', 15_000);
    proc.stdout.emit('data', Buffer.from(JSON.stringify({ streams: [] })));
    proc.emit('close', 0);
    await pending;

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain('-timeout');
    expect(args).not.toContain('-rw_timeout');
    expect(args[args.indexOf('-timeout') + 1]).toBe('15000000');
  });
});

describe('ffprobeStream — surfaces the real reason on non-zero exit', () => {
  beforeEach(() => spawnMock.mockReset());

  // ffprobe echoes the full credentialed input URL on the last stderr line before
  // the concrete cause. Creds below are FABRICATED (RFC 5737 IP, fake password) —
  // the assertions prove they are scrubbed before the reason reaches a caller/UI.
  it('extracts ffprobe stderr reason and redacts every credential (UNSTABLE_STREAM)', async () => {
    const proc = fakeProc();
    spawnMock.mockReturnValue(proc);

    const pending = ffprobeStream('rtsp://admin:FAKEpw99@198.51.100.7:554/stream1');
    proc.stderr.emit(
      'data',
      Buffer.from(
        'rtsp://admin:FAKEpw99@198.51.100.7:554/user=admin_password=FAKEpw99_channel=1_stream=0: ' +
          'Server returned 401 Unauthorized\n'
      )
    );
    proc.emit('close', 1);

    const res = await pending;
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('UNSTABLE_STREAM');
    // The human-readable cause survives, the leading URL prefix is trimmed.
    expect(res.errorMessage).toBe('Server returned 401 Unauthorized');
    // Hard guarantee: no credential shape leaks into the surfaced message.
    expect(res.errorMessage).not.toContain('FAKEpw99');
    expect(res.errorMessage).not.toContain('admin');
    expect(res.errorMessage).not.toContain('@');
  });

  it('falls back to a generic exit message when ffprobe writes nothing to stderr', async () => {
    const proc = fakeProc();
    spawnMock.mockReturnValue(proc);

    const pending = ffprobeStream('rtsp://10.20.40.11:554/stream1');
    proc.emit('close', 1);

    const res = await pending;
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('UNSTABLE_STREAM');
    expect(res.errorMessage).toBe('ffprobe exit 1');
  });

  it('parses stdout JSON on a clean exit (guards the -v error switch)', async () => {
    const proc = fakeProc();
    spawnMock.mockReturnValue(proc);

    const pending = ffprobeStream('rtsp://10.20.40.11:554/stream1');
    proc.stdout.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          streams: [
            {
              codec_type: 'video',
              codec_name: 'h264',
              width: 1920,
              height: 1080,
              avg_frame_rate: '15/1',
              bit_rate: '2048000',
            },
          ],
        })
      )
    );
    proc.emit('close', 0);

    const res = await pending;
    expect(res.success).toBe(true);
    expect(res.codec).toBe('H264');
    expect(res.resolution).toBe('1920x1080');
    expect(res.fps).toBe(15);
    expect(res.bitrateKbps).toBe(2048);
  });
});

describe('rtspDescribe — status classification', () => {
  const URL = 'rtsp://10.20.40.11:554/stream1';
  beforeEach(() => {
    mockRtspQueue.length = 0;
  });

  it('200 OK on first DESCRIBE → success', async () => {
    mockRtspQueue.push('RTSP/1.0 200 OK\r\nCSeq: 1\r\n\r\n');
    const r = await rtspDescribe(URL, 'admin', 'pw', 1000);
    expect(r.success).toBe(true);
  });

  it('401 → digest retry → 200 → success', async () => {
    mockRtspQueue.push(
      'RTSP/1.0 401 Unauthorized\r\nWWW-Authenticate: Digest realm="AnistonVMS", nonce="abc123"\r\n\r\n',
      'RTSP/1.0 200 OK\r\nCSeq: 2\r\n\r\n'
    );
    const r = await rtspDescribe(URL, 'admin', 'pw', 1000);
    expect(r.success).toBe(true);
  });

  it('401 still failing after auth retry → INVALID_CREDENTIALS', async () => {
    mockRtspQueue.push(
      'RTSP/1.0 401 Unauthorized\r\nWWW-Authenticate: Digest realm="AnistonVMS", nonce="abc123"\r\n\r\n',
      'RTSP/1.0 401 Unauthorized\r\n\r\n'
    );
    const r = await rtspDescribe(URL, 'admin', 'wrong', 1000);
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('INVALID_CREDENTIALS');
  });

  it('403 Forbidden → INVALID_CREDENTIALS (authorization is a credential fault, not a protocol fault)', async () => {
    mockRtspQueue.push('RTSP/1.0 403 Forbidden\r\n\r\n');
    const r = await rtspDescribe(URL, 'admin', 'pw', 1000);
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('INVALID_CREDENTIALS');
  });

  it('404 Not Found → INVALID_STREAM_PATH', async () => {
    mockRtspQueue.push('RTSP/1.0 404 Not Found\r\n\r\n');
    const r = await rtspDescribe(URL, 'admin', 'pw', 1000);
    expect(r.errorCode).toBe('INVALID_STREAM_PATH');
  });

  it('454 Method Not Valid In This State → RTSP_PROTOCOL_FAILURE, NOT INVALID_CREDENTIALS (CAM-007)', async () => {
    mockRtspQueue.push('RTSP/1.0 454 Method Not Valid In This State\r\n\r\n');
    const r = await rtspDescribe(URL, 'admin', 'pw', 1000);
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('RTSP_PROTOCOL_FAILURE');
    expect(r.errorCode).not.toBe('INVALID_CREDENTIALS');
  });

  it('socket timeout → TIMEOUT', async () => {
    mockRtspQueue.push('__TIMEOUT__');
    const r = await rtspDescribe(URL, 'admin', 'pw', 1000);
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('TIMEOUT');
  });
});
