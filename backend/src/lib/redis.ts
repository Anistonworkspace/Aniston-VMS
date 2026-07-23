import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err: Error) => logger.error('Redis error', { error: err.message }));

// BullMQ manages its own (blocking) connections, so it needs discrete options
// derived from REDIS_URL rather than the shared client. CRITICAL: carry the
// username/password through — omitting them makes every queue/worker connect
// unauthenticated, which fails with `NOAUTH Authentication required` against a
// `requirepass`-protected Redis (prod), silently killing all background jobs.
const bullRedisUrl = new URL(env.REDIS_URL);
export const bullConnection = {
  host: bullRedisUrl.hostname,
  port: Number(bullRedisUrl.port || 6379),
  username: bullRedisUrl.username ? decodeURIComponent(bullRedisUrl.username) : undefined,
  password: bullRedisUrl.password ? decodeURIComponent(bullRedisUrl.password) : undefined,
};
