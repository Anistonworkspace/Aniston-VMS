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

const envSchema = z.object({
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
  ALLOW_PROD_SEED: z.coerce.boolean().default(false),

  // Stage 2 — health engine
  HEALTH_SCHEDULER_ENABLED: z.coerce.boolean().default(true),
  HEALTH_SIM_MODE: z.coerce.boolean().default(false),
  HEALTH_CHECK_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(5),
  HEALTH_CAMS_PER_MINUTE: z.coerce.number().int().min(1).default(25),
  HEALTH_TCP_TIMEOUT_MS: z.coerce.number().int().default(4000),
  HEALTH_FFPROBE_TIMEOUT_MS: z.coerce.number().int().default(15_000),
  HEALTH_RETRY_DELAY_MS: z.coerce.number().int().default(5000),

  // Stage 3 — snapshot engine
  SNAPSHOT_SCHEDULER_ENABLED: z.coerce.boolean().default(true),
  SNAPSHOT_SUB_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(15),
  SNAPSHOT_RETENTION_DAYS: z.coerce.number().int().min(1).default(90),
  SNAPSHOT_THUMB_RETENTION_DAYS: z.coerce.number().int().min(1).default(365),
  SNAPSHOT_INCIDENT_RETENTION_DAYS: z.coerce.number().int().min(1).default(1095),
  SNAPSHOT_URL_TTL_SECONDS: z.coerce.number().int().min(60).default(600),

  // Stage 4 — incident engine + alerts
  INCIDENT_ENGINE_ENABLED: z.coerce.boolean().default(true),
  INCIDENT_CONSECUTIVE_FAILS: z.coerce.number().int().min(1).default(3),
  INCIDENT_OFFLINE_MINUTES: z.coerce.number().int().min(1).default(5),
  INCIDENT_RECOVERY_CHECKS: z.coerce.number().int().min(1).default(2),
  ALERT_MOCK_MODE: z.coerce.boolean().default(true),
  // Stage 9 drills: unlocks POST /api/platform/workers/:name/:action so the
  // "kill a worker → self-alert" demo can stop/start loops. Never enable in prod.
  DRILL_MODE: z.coerce.boolean().default(false),
  ESCALATION_WORKER_ENABLED: z.coerce.boolean().default(true),
  ESCALATION_INTERVAL_SECONDS: z.coerce.number().int().min(10).default(60),

  // Stage 5 — storage adapter (local disk default; s3-compatible optional)
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('aniston-vms'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  FILE_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).default(900),

  // Stage 6 — playback + clip export
  PLAYBACK_SIM_MODE: z.coerce.boolean().default(true),
  MEDIAMTX_API_URL: z.string().default('http://localhost:9997'),
  MEDIAMTX_RTSP_URL: z.string().default('rtsp://localhost:8554'),
  MEDIAMTX_WEBRTC_URL: z.string().default('http://localhost:8889'),
  MEDIAMTX_HLS_URL: z.string().default('http://localhost:8888'),
  STREAM_SESSION_TIMEOUT_SECONDS: z.coerce.number().int().min(10).default(45),
  STREAM_MAX_CONCURRENT_PER_CAMERA: z.coerce.number().int().min(1).default(10),
  CLIP_EXPORT_WORKER_ENABLED: z.coerce.boolean().default(true),
  CLIP_EXPORT_CONCURRENCY: z.coerce.number().int().min(1).default(2),
  CLIP_EXPORT_MAX_DURATION_MINUTES: z.coerce.number().int().min(1).default(60),
  CLIP_EXPORT_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),

  // Stage 7 — reports
  REPORTS_MAX_RANGE_DAYS: z.coerce.number().int().min(1).default(92),
  REPORTS_SLA_UPTIME_TARGET_PCT: z.coerce.number().min(0).max(100).default(99.5),

  // Stage 8 — maintenance windows
  MAINTENANCE_REMINDER_HOURS_BEFORE: z.coerce.number().int().min(1).default(24),

  // Stage 10 — realtime gateway
  SOCKET_IO_ENABLED: z.coerce.boolean().default(true),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
