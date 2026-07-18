import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { env } from '../../config/env.js';
import { redis } from '../../lib/redis.js';

// ─────────────────────────────────────────────────────────────────────────────
// Stage 2 checkers — each returns a CheckResult; the pipeline in
// health.scheduler.ts runs them in order ROUTER_TCP → RTSP_PORT → RTSP_AUTH →
// VIDEO_VALIDATION and short-circuits on failure (docs/02-TRD.md §2).
// In sim mode (HEALTH_SIM_MODE=true) results are synthesized from Redis fault
// keys `sim:fault:<cameraCode>` so the fault-injector demo yields distinct
// diagnoses without real hardware.
// ─────────────────────────────────────────────────────────────────────────────

export interface CheckResult {
  success: boolean;
  responseTimeMs: number;
  errorCode?: string;
  errorMessage?: string;
  codec?: string;
  resolution?: string;
  fps?: number;
  bitrateKbps?: number;
  framesReceived?: number;
  signalDbm?: number;
}

export type SimFault =
  | 'SITE_INTERNET_DOWN'
  | 'SIM_SIGNAL_ISSUE'
  | 'NETWORK_UNSTABLE'
  | 'CAMERA_OFFLINE'
  | 'CONFIG_ERROR'
  | 'STREAM_DEGRADED'
  | 'IMAGE_PROBLEM'
  | null;

export async function getSimFault(cameraCode: string): Promise<SimFault> {
  if (!env.HEALTH_SIM_MODE) return null;
  const v = await redis.get(`sim:fault:${cameraCode}`);
  return (v as SimFault) ?? null;
}

function timed(): () => number {
  const t0 = Date.now();
  return () => Date.now() - t0;
}

// ── ROUTER_TCP / RTSP_PORT ───────────────────────────────────────────────────

export function tcpProbe(
  host: string,
  port: number,
  timeoutMs = env.HEALTH_TCP_TIMEOUT_MS
): Promise<CheckResult> {
  return new Promise((resolve) => {
    const elapsed = timed();
    const sock = new net.Socket();
    let settled = false;
    const done = (r: CheckResult): void => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolve(r);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => done({ success: true, responseTimeMs: elapsed() }));
    sock.once('timeout', () =>
      done({
        success: false,
        responseTimeMs: elapsed(),
        errorCode: 'TIMEOUT',
        errorMessage: `TCP connect to ${host}:${port} timed out`,
      })
    );
    sock.once('error', (err: NodeJS.ErrnoException) =>
      done({
        success: false,
        responseTimeMs: elapsed(),
        errorCode: err.code ?? 'CONN_ERROR',
        errorMessage: err.message,
      })
    );
    sock.connect(port, host);
  });
}

// ── RTSP_AUTH (DESCRIBE over raw socket; Basic + Digest) ─────────────────────

function md5(s: string): string {
  return crypto.createHash('md5').update(s).digest('hex');
}

function digestAuthHeader(user: string, pass: string, challenge: string, uri: string): string {
  const realm = /realm="([^"]*)"/.exec(challenge)?.[1] ?? '';
  const nonce = /nonce="([^"]*)"/.exec(challenge)?.[1] ?? '';
  const ha1 = md5(`${user}:${realm}:${pass}`);
  const ha2 = md5(`DESCRIBE:${uri}`);
  const response = md5(`${ha1}:${nonce}:${ha2}`);
  return `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
}

function rtspRequest(
  host: string,
  port: number,
  uri: string,
  headers: string[],
  timeoutMs: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    let buf = '';
    let settled = false;
    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      sock.destroy();
      reject(err);
    };
    sock.setTimeout(timeoutMs);
    sock.once('timeout', () => fail(Object.assign(new Error('RTSP timeout'), { code: 'TIMEOUT' })));
    sock.once('error', fail);
    sock.on('data', (d) => {
      buf += d.toString('utf8');
      if (buf.includes('\r\n\r\n')) {
        settled = true;
        sock.destroy();
        resolve(buf);
      }
    });
    sock.connect(port, host, () => {
      sock.write(
        [
          `DESCRIBE ${uri} RTSP/1.0`,
          'CSeq: 1',
          'User-Agent: AnistonVMS-Health/1.0',
          'Accept: application/sdp',
          ...headers,
          '',
          '',
        ].join('\r\n')
      );
    });
  });
}

export async function rtspDescribe(
  rtspUrl: string,
  username: string,
  password: string,
  timeoutMs = env.HEALTH_TCP_TIMEOUT_MS
): Promise<CheckResult> {
  const elapsed = timed();
  let host: string;
  let port: number;
  try {
    const u = new URL(rtspUrl);
    host = u.hostname;
    port = u.port ? Number(u.port) : 554;
  } catch {
    return {
      success: false,
      responseTimeMs: 0,
      errorCode: 'INVALID_STREAM_PATH',
      errorMessage: 'Unparseable RTSP URL',
    };
  }
  try {
    let res = await rtspRequest(host, port, rtspUrl, [], timeoutMs);
    let status = Number(/^RTSP\/1\.0 (\d{3})/.exec(res)?.[1] ?? 0);
    if (status === 401) {
      const challenge = /WWW-Authenticate: (.*)/i.exec(res)?.[1] ?? '';
      const auth = challenge.trim().startsWith('Digest')
        ? digestAuthHeader(username, password, challenge, rtspUrl)
        : `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      res = await rtspRequest(host, port, rtspUrl, [`Authorization: ${auth}`], timeoutMs);
      status = Number(/^RTSP\/1\.0 (\d{3})/.exec(res)?.[1] ?? 0);
    }
    if (status === 200) return { success: true, responseTimeMs: elapsed() };
    if (status === 401)
      return {
        success: false,
        responseTimeMs: elapsed(),
        errorCode: 'INVALID_CREDENTIALS',
        errorMessage: 'RTSP 401 after auth',
      };
    if (status === 404)
      return {
        success: false,
        responseTimeMs: elapsed(),
        errorCode: 'INVALID_STREAM_PATH',
        errorMessage: 'RTSP 404 Not Found',
      };
    return {
      success: false,
      responseTimeMs: elapsed(),
      errorCode: 'RTSP_PROTOCOL_FAILURE',
      errorMessage: `RTSP status ${status}`,
    };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    return {
      success: false,
      responseTimeMs: elapsed(),
      errorCode: e.code ?? 'RTSP_PROTOCOL_FAILURE',
      errorMessage: e.message,
    };
  }
}

// ── VIDEO_VALIDATION (ffprobe) ───────────────────────────────────────────────

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  bit_rate?: string;
}

export function ffprobeStream(
  rtspUrl: string,
  timeoutMs = env.HEALTH_FFPROBE_TIMEOUT_MS
): Promise<CheckResult> {
  return new Promise((resolve) => {
    const elapsed = timed();
    const args = [
      '-v',
      'quiet',
      '-rtsp_transport',
      'tcp',
      '-select_streams',
      'v:0',
      '-show_streams',
      '-of',
      'json',
      '-i',
      rtspUrl,
    ];
    let out = '';
    let settled = false;
    const proc = spawn('ffprobe', args, { windowsHide: true });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill('SIGKILL');
      resolve({
        success: false,
        responseTimeMs: elapsed(),
        errorCode: 'CAMERA_TIMEOUT',
        errorMessage: 'ffprobe timed out',
      });
    }, timeoutMs);
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.once('error', (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // ffprobe binary missing — treat as skipped-success so environments
      // without ffmpeg don't mark every camera CRITICAL (logged upstream).
      resolve({
        success: err.code === 'ENOENT',
        responseTimeMs: elapsed(),
        errorCode: err.code === 'ENOENT' ? 'FFPROBE_MISSING' : 'FFPROBE_ERROR',
        errorMessage: err.message,
      });
    });
    proc.once('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        resolve({
          success: false,
          responseTimeMs: elapsed(),
          errorCode: 'UNSTABLE_STREAM',
          errorMessage: `ffprobe exit ${code}`,
        });
        return;
      }
      try {
        const parsed = JSON.parse(out) as { streams?: FfprobeStream[] };
        const v = parsed.streams?.find((s) => s.codec_type === 'video');
        if (!v) {
          resolve({
            success: false,
            responseTimeMs: elapsed(),
            errorCode: 'UNSTABLE_STREAM',
            errorMessage: 'No video stream found',
          });
          return;
        }
        const [num, den] = (v.avg_frame_rate ?? '0/1').split('/').map(Number);
        resolve({
          success: true,
          responseTimeMs: elapsed(),
          codec: v.codec_name?.toUpperCase(),
          resolution: v.width && v.height ? `${v.width}x${v.height}` : undefined,
          fps: den ? Math.round(num / den) : undefined,
          bitrateKbps: v.bit_rate ? Math.round(Number(v.bit_rate) / 1000) : undefined,
        });
      } catch {
        resolve({
          success: false,
          responseTimeMs: elapsed(),
          errorCode: 'FFPROBE_PARSE',
          errorMessage: 'Bad ffprobe output',
        });
      }
    });
  });
}

// ── Sim-mode synthetic results (fault injector) ──────────────────────────────

function jitterMs(base: number, spread: number): number {
  return base + Math.floor(Math.random() * spread);
}

export interface SimExpectations {
  codec: string;
  resolution: string;
  fps: number;
  bitrateKbps: number;
}

/** Synthesize the 4-stage pipeline for a camera under an injected fault. */
export function simulateStages(
  fault: SimFault,
  exp: SimExpectations
): {
  routerTcp: CheckResult;
  rtspPort: CheckResult;
  rtspAuth: CheckResult;
  video: CheckResult;
  signalDbm: number;
} {
  const ok = (extra: Partial<CheckResult> = {}): CheckResult => ({
    success: true,
    responseTimeMs: jitterMs(20, 60),
    ...extra,
  });
  const fail = (errorCode: string, errorMessage: string): CheckResult => ({
    success: false,
    responseTimeMs: jitterMs(env.HEALTH_TCP_TIMEOUT_MS - 500, 500),
    errorCode,
    errorMessage,
  });
  const goodVideo = ok({
    codec: exp.codec,
    resolution: exp.resolution,
    fps: exp.fps,
    bitrateKbps: Math.round(exp.bitrateKbps * (0.9 + Math.random() * 0.2)),
    framesReceived: 250,
  });
  const signalDbm = fault === 'SIM_SIGNAL_ISSUE' ? -105 : -67;

  switch (fault) {
    case 'SITE_INTERNET_DOWN':
    case 'SIM_SIGNAL_ISSUE':
      return {
        routerTcp: fail('TIMEOUT', 'Router unreachable'),
        rtspPort: fail('SKIPPED', 'Skipped — router down'),
        rtspAuth: fail('SKIPPED', 'Skipped — router down'),
        video: fail('SKIPPED', 'Skipped — router down'),
        signalDbm,
      };
    case 'CAMERA_OFFLINE':
      return {
        routerTcp: ok(),
        rtspPort: fail('ECONNREFUSED', 'Camera port closed — router online'),
        rtspAuth: fail('SKIPPED', 'Skipped — camera port closed'),
        video: fail('SKIPPED', 'Skipped — camera port closed'),
        signalDbm,
      };
    case 'CONFIG_ERROR':
      return {
        routerTcp: ok(),
        rtspPort: ok(),
        rtspAuth: fail('INVALID_CREDENTIALS', 'RTSP 401 after auth'),
        video: fail('SKIPPED', 'Skipped — auth failed'),
        signalDbm,
      };
    case 'STREAM_DEGRADED':
      return {
        routerTcp: ok(),
        rtspPort: ok(),
        rtspAuth: ok(),
        video: ok({
          codec: exp.codec,
          resolution: exp.resolution,
          fps: Math.max(1, Math.round(exp.fps * 0.3)),
          bitrateKbps: Math.round(exp.bitrateKbps * 0.25),
          framesReceived: 40,
        }),
        signalDbm,
      };
    case 'NETWORK_UNSTABLE': {
      // Flapping: ~40% of runs fail at the RTSP port stage with high latency.
      const flap = Math.random() < 0.4;
      return {
        routerTcp: ok({ responseTimeMs: jitterMs(300, 1500) }),
        rtspPort: flap
          ? fail('TIMEOUT', 'Intermittent timeout')
          : ok({ responseTimeMs: jitterMs(300, 1500) }),
        rtspAuth: flap ? fail('SKIPPED', 'Skipped — port flapped') : ok(),
        video: flap ? fail('SKIPPED', 'Skipped — port flapped') : goodVideo,
        signalDbm,
      };
    }
    case 'IMAGE_PROBLEM': // stream fine; image analysis (Stage 4) flags it
    default:
      return { routerTcp: ok(), rtspPort: ok(), rtspAuth: ok(), video: goodVideo, signalDbm };
  }
}
