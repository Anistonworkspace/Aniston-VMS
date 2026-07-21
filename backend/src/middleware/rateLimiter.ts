import rateLimit, { type Options, type Store, type IncrementResponse } from 'express-rate-limit';
import { redis } from '../lib/redis.js';
import { env } from '../config/env.js';

// Distributed rate-limit store backed by the shared Redis client. The default
// express-rate-limit MemoryStore is per-process, so behind >1 backend replica
// each instance keeps its own counter and the effective limit is multiplied by
// the replica count (a real DoS/brute-force gap). Redis gives one shared counter.
class RedisRateStore implements Store {
  private windowMs = 60_000;
  prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private key(k: string): string {
    return this.prefix + k;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const rk = this.key(key);
    const totalHits = await redis.incr(rk);
    if (totalHits === 1) {
      await redis.pexpire(rk, this.windowMs);
    }
    let ttl = await redis.pttl(rk);
    if (ttl < 0) {
      // Key exists without a TTL (e.g. a crash between INCR and PEXPIRE) — heal it.
      await redis.pexpire(rk, this.windowMs);
      ttl = this.windowMs;
    }
    return { totalHits, resetTime: new Date(Date.now() + ttl) };
  }

  async decrement(key: string): Promise<void> {
    await redis.decr(this.key(key));
  }

  async resetKey(key: string): Promise<void> {
    await redis.del(this.key(key));
  }
}

export const generalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: new RedisRateStore('rl:general:'),
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
});

export const authLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: new RedisRateStore('rl:auth:'),
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many auth attempts' } },
});
