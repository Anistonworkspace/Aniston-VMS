import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { env } from '../../config/env.js';
import { redis } from '../../lib/redis.js';
import { redactRtsp } from '../../lib/rtsp-url.js';

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
    // 401 (Unauthorized) and 403 (Forbidden) are genuine credential/authorization
    // rejections — the operator must fix the stored username/password. Anything
    // else (e.g. 454 Method Not Valid In This State) is a protocol/session fault,
    // not a credentials problem, and is handled by the fall-through below.
    if (status === 401 || status === 403)
      return {
        success: false,
        responseTimeMs: elapsed(),
        errorCode: 'INVALID_CREDENTIALS',
        errorMessage: `RTSP ${status} — credentials/authorization rejected`,
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

/**
 * Turn ffprobe's stderr into a safe, operator-actionable failure reason.
 *
 * When the input stream can't be opened, ffprobe echoes the full input URL
 * followed by the concrete cause on the last line of stderr, e.g.
 *   `rtsp://user:pass@host/path: Server returned 401 Unauthorized`
 *   `rtsp://user:pass@host/path: method SETUP failed: 461 Unsupported Transport`
 *   `rtsp://user:pass@host/path: Invalid data found when processing input`
 *
 * We surface that cause so a failed Test Connection tells the operator WHY —
 * but only after `redactRtsp()` scrubs every credential shape, and with the
 * leading (now-redacted) URL trimmed so the message is the reason alone.
 * Falls back to a generic `ffprobe exit <code>` if stderr is empty.
 */
function ffprobeFailureReason(stderr: string, code: number | null): string {
  const last = stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .at(-1);
  if (!last) return `ffprobe exit ${code}`;
  const reason = redactRtsp(last)
    // drop a leading "rtsp://…: " URL prefix so only the human reason remains
    .replace(/^rtsps?:\/\/\S+?:\s+/i, '')
    .trim();
  return (reason || `ffprobe exit ${code}`).slice(0, 300);
}

export function ffprobeStream(
  rtspUrl: string,
  timeoutMs = env.HEALTH_FFPROBE_TIMEOUT_MS
): Promise<CheckResult> {
  return new Promise((resolve) => {
    const elapsed = timed();
    // `-v error` (not `quiet`): stdout stays clean JSON (`-of json`) on success,
    // while stderr carries the concrete failure reason on error. Without this the
    // probe could only ever report an opaque exit code — undiagnosable in the field.
    const args = [
      '-v',
      'error',
      // Transport ladder: try RTP-over-TCP (interleaved, lossless) FIRST, then fall
      // back to UDP when TCP setup fails. This is ffmpeg's NATIVE form of a TCP→UDP
      // ladder — one process, no shell — so the identical strategy is reusable in the
      // snapshot capture and the MediaMTX transcode command string (see
      // frame-capture.ts / mediamtx.adapter.ts). Replaces a hard `-rtsp_transport tcp`
      // that had NO fallback: a camera whose media session only survives over UDP
      // (DESCRIBE 200 ok, but TCP-interleaved RTP read → EPERM / "Operation not
      // permitted") could never be validated here even though MediaMTX
      // (rtspTransport: automatic) streams it fine in production. TCP-capable cameras
      // are unaffected — TCP is still attempted first, so no packet-loss regression.
      '-rtsp_flags',
      'prefer_tcp',
      // Bounded socket I/O: a half-open / silent media path fails with a real reason
      // instead of hanging until the SIGKILL backstop below (which can only report an
      // opaque timeout). Microseconds. Generous (= full probe budget) so it never
      // pre-empts the prefer_tcp negotiation on a merely-slow camera.
      // Use `-timeout` (the demuxer's documented socket-I/O AVOption), NOT `-rw_timeout`:
      // ffprobe tolerates the latter but the ffmpeg CLI in v8.x rejects it and exits 8,
      // so `-timeout` keeps this checker byte-for-byte consistent with the reusable
      // strategy the snapshot capture (frame-capture.ts) actually depends on.
      '-timeout',
      String(timeoutMs * 1000),
      '-select_streams',
      'v:0',
      '-show_streams',
      '-of',
      'json',
      '-i',
      rtspUrl,
    ];
    let out = '';
    let errOut = '';
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
    proc.stderr.on('data', (d) => (errOut += d.toString()));
    proc.once('error', (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Fail closed. A missing/broken ffprobe binary must NEVER be reported as a
      // successful probe: real stream validation is mandatory, so ENOENT (binary
      // not installed) is a hard failure, not a skip. The runtime image ships
      // ffmpeg (backend/Dockerfile); this guard protects against a future image
      // regression silently turning Test Connection into a false green.
      const missing = err.code === 'ENOENT';
      resolve({
        success: false,
        responseTimeMs: elapsed(),
        errorCode: missing ? 'FFPROBE_MISSING' : 'FFPROBE_ERROR',
        errorMessage: missing
          ? 'ffprobe binary not found — video stream could not be validated'
          : err.message,
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
          errorMessage: ffprobeFailureReason(errOut, code),
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
