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
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
