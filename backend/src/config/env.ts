import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// The .env file lives at the monorepo root, but `npm run dev --workspace=backend`
// sets cwd to backend/ — so plain `import 'dotenv/config'` misses it.
// Load order (dotenv never overrides vars that are already set):
//   1. cwd/.env            — explicit local override
//   2. repo root .env      — ../../../ from src/config (dev via tsx)
//   3. repo root .env      — ../../ from backend/dist (compiled build)
// Missing files are silently ignored, so Docker (env_file/environment) is unaffected.
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
loadEnv();
for (const rel of ['../../../.env', '../../.env']) {
  loadEnv({ path: path.resolve(moduleDir, rel) });
}

// z.coerce.boolean() coerces via Boolean(), so ANY non-empty string — including
// "false" — becomes true. That makes the production "must be false" guards below
// impossible to satisfy and silently flips flags like ALLOW_PROD_SEED=false to true.
// Parse env booleans by value instead: false/0/no/off/'' → false, true/1/yes/on → true.
const envBool = (defaultValue: boolean) =>
  z.preprocess((v) => {
    if (v === undefined || v === '') return defaultValue;
    if (typeof v === 'boolean') return v;
    const s = String(v).trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(s)) return true;
    if (['false', '0', 'no', 'off'].includes(s)) return false;
    return v; // unknown value → let z.boolean() surface a clear validation error
  }, z.boolean());

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  // Refresh tokens are opaque random bytes (not JWTs) — this is reserved for future JWT refresh signing
  JWT_REFRESH_SECRET: z.string().min(32).optional(),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  ENCRYPTION_KEY: z.string().length(64, 'ENCRYPTION_KEY must be exactly 64 hex chars (32 bytes)'),
  // Optional previous key retained for dual-read during rotation (utils/encryption.ts).
  ENCRYPTION_KEY_OLD: z.string().length(64).optional(),
  // Keyring version stamped on new ciphertext. Default v1 = ENCRYPTION_KEY.
  ENCRYPTION_KEY_ACTIVE: z.enum(['v0', 'v1']).default('v1'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().default(10),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().default(100),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(900_000),
  AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().default(50),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  ALLOW_PROD_SEED: envBool(false),

  // Stage 2 — health engine
  HEALTH_SCHEDULER_ENABLED: envBool(true),
  HEALTH_SIM_MODE: envBool(false),
  HEALTH_CHECK_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(5),
  HEALTH_CAMS_PER_MINUTE: z.coerce.number().int().min(1).default(25),
  HEALTH_TCP_TIMEOUT_MS: z.coerce.number().int().default(4000),
  HEALTH_FFPROBE_TIMEOUT_MS: z.coerce.number().int().default(15_000),
  HEALTH_RETRY_DELAY_MS: z.coerce.number().int().default(5000),

  // Stage 3 — snapshot engine
  SNAPSHOT_SCHEDULER_ENABLED: envBool(true),
  SNAPSHOT_SUB_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(15),
  SNAPSHOT_RETENTION_DAYS: z.coerce.number().int().min(1).default(90),
  SNAPSHOT_THUMB_RETENTION_DAYS: z.coerce.number().int().min(1).default(365),
  SNAPSHOT_INCIDENT_RETENTION_DAYS: z.coerce.number().int().min(1).default(1095),
  SNAPSHOT_URL_TTL_SECONDS: z.coerce.number().int().min(60).default(600),
  // Real frame capture is the default. SNAPSHOT_SIM_MODE writes a real-dimension
  // synthetic frame instead of shelling out to ffmpeg — for hermetic dev/test
  // with no reachable cameras only. Gated false in production (see below).
  SNAPSHOT_SIM_MODE: envBool(false),
  SNAPSHOT_CAPTURE_TIMEOUT_MS: z.coerce.number().int().min(1000).default(15_000),
  FFMPEG_PATH: z.string().default('ffmpeg'),

  // Stage 4 — incident engine + alerts
  INCIDENT_ENGINE_ENABLED: envBool(true),
  INCIDENT_CONSECUTIVE_FAILS: z.coerce.number().int().min(1).default(3),
  INCIDENT_OFFLINE_MINUTES: z.coerce.number().int().min(1).default(5),
  INCIDENT_RECOVERY_CHECKS: z.coerce.number().int().min(1).default(2),
  ALERT_MOCK_MODE: envBool(true),
  // Stage 9 drills: unlocks POST /api/platform/workers/:name/:action so the
  // "kill a worker → self-alert" demo can stop/start loops. Never enable in prod.
  DRILL_MODE: envBool(false),
  ESCALATION_WORKER_ENABLED: envBool(true),
  ESCALATION_INTERVAL_SECONDS: z.coerce.number().int().min(10).default(60),

  // Stage 5 — storage adapter (local disk default; s3-compatible optional)
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('aniston-vms'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: envBool(true),
  FILE_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).default(900),

  // Stage 6 — playback + clip export
  PLAYBACK_SIM_MODE: envBool(true),
  MEDIAMTX_API_URL: z.string().default('http://localhost:9997'),
  MEDIAMTX_RTSP_URL: z.string().default('rtsp://localhost:8554'),
  MEDIAMTX_WEBRTC_URL: z.string().default('http://localhost:8889'),
  MEDIAMTX_HLS_URL: z.string().default('http://localhost:8888'),
  // Browser-facing media (P0-1): never hand MediaMTX localhost URLs to the client.
  // Live/playback URLs are same-origin (/media/*) and short-lived HMAC-signed.
  // MEDIA_PUBLIC_BASE_URL='' → same-origin (inherits the page's HTTPS/WSS); set to
  // an absolute https:// origin only if media is served from a different host.
  MEDIA_PUBLIC_BASE_URL: z.string().default(''),
  MEDIA_URL_SIGNING_SECRET: z.string().optional(),
  PLAYBACK_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  STREAM_SESSION_TIMEOUT_SECONDS: z.coerce.number().int().min(10).default(45),
  STREAM_MAX_CONCURRENT_PER_CAMERA: z.coerce.number().int().min(1).default(10),
  CLIP_EXPORT_WORKER_ENABLED: envBool(true),
  CLIP_EXPORT_CONCURRENCY: z.coerce.number().int().min(1).default(2),
  CLIP_EXPORT_MAX_DURATION_MINUTES: z.coerce.number().int().min(1).default(60),
  CLIP_EXPORT_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),

  // Stage 7 — reports
  REPORTS_MAX_RANGE_DAYS: z.coerce.number().int().min(1).default(92),
  REPORTS_SLA_UPTIME_TARGET_PCT: z.coerce.number().min(0).max(100).default(99.5),
  // CR-12 — recurring scheduled-report email delivery (mock transport unless
  // SMTP_HOST is configured; attachments land in UPLOAD_DIR/reports-outbox).
  REPORT_EMAIL_ENABLED: envBool(true),
  REPORT_EMAIL_TO: z.string().default('ops@anistonvms.example'),
  REPORT_EMAIL_CRON: z.string().default('30 2 * * *'),

  // Stage 8 — maintenance windows
  MAINTENANCE_REMINDER_HOURS_BEFORE: z.coerce.number().int().min(1).default(24),

  // Stage 10 — realtime gateway
  SOCKET_IO_ENABLED: envBool(true),
})
  .superRefine((val, ctx) => {
    // Production hardening: no sim/mock/drill modes and no placeholder secrets.
    if (val.NODE_ENV === 'production') {
      const mustBeFalse = ['HEALTH_SIM_MODE', 'PLAYBACK_SIM_MODE', 'SNAPSHOT_SIM_MODE', 'ALERT_MOCK_MODE', 'DRILL_MODE'] as const;
      for (const k of mustBeFalse) {
        if (val[k] === true) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [k], message: `${k} must be false in production` });
        }
      }
      if (!val.JWT_REFRESH_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message: 'JWT_REFRESH_SECRET is required in production',
        });
      }
      if (!val.MEDIA_URL_SIGNING_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MEDIA_URL_SIGNING_SECRET'],
          message: 'MEDIA_URL_SIGNING_SECRET is required in production (signs browser media URLs)',
        });
      }
      if (val.MEDIA_PUBLIC_BASE_URL) {
        if (!/^(?:https|wss):\/\//i.test(val.MEDIA_PUBLIC_BASE_URL)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['MEDIA_PUBLIC_BASE_URL'],
            message: 'MEDIA_PUBLIC_BASE_URL must be https:// or wss:// in production',
          });
        }
        if (/\/\/(?:localhost|127\.0\.0\.1)(?:[:/]|$)/i.test(val.MEDIA_PUBLIC_BASE_URL)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['MEDIA_PUBLIC_BASE_URL'],
            message: 'MEDIA_PUBLIC_BASE_URL must not point at localhost in production',
          });
        }
      }
      const placeholder =
        /(change[_-]?me|placeholder|example|your[_-]?(secret|key)|dev[_-]?secret|insecure|xxxx|secretsecret)/i;
      for (const k of [
        'JWT_SECRET',
        'JWT_REFRESH_SECRET',
        'ENCRYPTION_KEY',
        'MEDIA_URL_SIGNING_SECRET',
      ] as const) {
        const v = val[k];
        if (typeof v === 'string' && placeholder.test(v)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [k],
            message: `${k} appears to be a placeholder/dev value — set a real secret in production`,
          });
        }
      }
    }
    // Rotation config sanity: writing with the old key requires it to be present.
    if (val.ENCRYPTION_KEY_ACTIVE === 'v0' && !val.ENCRYPTION_KEY_OLD) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ENCRYPTION_KEY_OLD'],
        message: 'ENCRYPTION_KEY_OLD must be set when ENCRYPTION_KEY_ACTIVE=v0',
      });
    }
  });

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
