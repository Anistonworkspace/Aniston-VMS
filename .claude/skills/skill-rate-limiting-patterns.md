# Skill — Rate Limiting Patterns

Redis-backed rate limiting for multi-instance production, per-route limits, 429 frontend handling.

---

## Why Redis-backed (not in-memory)

In-memory rate limiters are **silently useless** behind a load balancer or PM2 cluster.
Each process has its own counter — a user can send N requests to each of M processes.
Always use Redis as the store in production.

---

## Backend — express-rate-limit + Redis store

```typescript
// backend/src/middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';
import RedisStore    from 'rate-limit-redis';
import { redisClient } from '../lib/redis.js';

// Auth routes — strict: 50 requests per 15 minutes
export const authRateLimiter = rateLimit({
  windowMs:          15 * 60 * 1000,   // 15 minutes
  max:               50,
  standardHeaders:   true,              // adds RateLimit-* headers
  legacyHeaders:     false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
    prefix: 'rl:auth:',
  }),
  keyGenerator: (req) => {
    // Rate limit by IP + user-agent for better fingerprinting
    return `${req.ip}:${req.headers['user-agent']?.slice(0, 50) ?? ''}`;
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code:    'RATE_LIMITED',
        message: 'Too many requests. Please wait before trying again.',
        retryAfter: Math.ceil((res.getHeader('RateLimit-Reset') as number) - Date.now() / 1000),
      },
    });
  },
  skip: (req) => {
    // Skip rate limit for trusted health check IPs
    return req.ip === '127.0.0.1' && req.path === '/api/health';
  },
});

// General API routes — 100 requests per minute
export const apiRateLimiter = rateLimit({
  windowMs:          60 * 1000,
  max:               100,
  standardHeaders:   true,
  legacyHeaders:     false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
    prefix: 'rl:api:',
  }),
  keyGenerator: (req) => {
    // Authenticated users rate-limited by userId (fairer than IP for offices)
    return (req as any).user?.id ?? req.ip;
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code:    'RATE_LIMITED',
        message: 'API rate limit exceeded. Maximum 100 requests per minute.',
      },
    });
  },
});

// Expensive operations — 10 per minute (exports, imports, bulk ops)
export const heavyRateLimiter = rateLimit({
  windowMs:          60 * 1000,
  max:               10,
  standardHeaders:   true,
  legacyHeaders:     false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
    prefix: 'rl:heavy:',
  }),
  keyGenerator: (req) => (req as any).user?.organizationId ?? req.ip,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many export/import requests. Please wait.' },
    });
  },
});
```

---

## Route registration — auth routes get stricter limits

```typescript
// backend/src/app.ts
import { authRateLimiter, apiRateLimiter, heavyRateLimiter } from './middleware/rateLimiter.js';

// Apply general rate limiter to ALL routes
app.use('/api/', apiRateLimiter);

// Auth routes get stricter limit on top
app.use('/api/auth/login',            authRateLimiter);
app.use('/api/auth/register',         authRateLimiter);
app.use('/api/auth/forgot-password',  authRateLimiter);
app.use('/api/auth/reset-password',   authRateLimiter);

// Heavy operations
app.use('/api/items/import',          heavyRateLimiter);
app.use('/api/*/export',              heavyRateLimiter);
app.use('/api/*/bulk-*',              heavyRateLimiter);
```

---

## Progressive backoff for repeated violations

```typescript
// For login — track failed attempts per user email to lock account
export async function trackLoginAttempt(email: string, success: boolean): Promise<{ locked: boolean; attemptsLeft: number }> {
  const key      = `login:attempts:${email.toLowerCase()}`;
  const lockKey  = `login:locked:${email.toLowerCase()}`;

  if (success) {
    await redisClient.del(key);
    return { locked: false, attemptsLeft: 5 };
  }

  const attempts = await redisClient.incr(key);
  if (attempts === 1) {
    await redisClient.expire(key, 15 * 60);   // window: 15 minutes
  }

  const MAX = 5;
  if (attempts >= MAX) {
    await redisClient.set(lockKey, '1', { EX: 30 * 60 });  // lock for 30 minutes
    return { locked: true, attemptsLeft: 0 };
  }

  return { locked: false, attemptsLeft: MAX - attempts };
}

// In auth service:
static async login(dto: LoginInput) {
  const isLocked = await redisClient.get(`login:locked:${dto.email.toLowerCase()}`);
  if (isLocked) {
    throw new TooManyRequestsError('Account temporarily locked due to too many failed attempts. Try again in 30 minutes.');
  }

  const user = await prisma.user.findUnique({ where: { email: dto.email } });
  const valid = user && await bcrypt.compare(dto.password, user.passwordHash);

  const { locked, attemptsLeft } = await trackLoginAttempt(dto.email, !!valid);

  if (!valid) {
    if (locked) throw new TooManyRequestsError('Account locked. Try again in 30 minutes.');
    throw new UnauthorizedError(`Invalid credentials. ${attemptsLeft} attempts remaining.`);
  }

  // ... proceed with login
}
```

---

## Frontend — handle 429 responses gracefully

```typescript
// frontend/src/store/api/baseApi.ts — in the baseQuery error handler

// RTK Query auto-handles 429 in the base query:
const baseQueryWithRetry = async (args: any, api: any, extraOptions: any) => {
  const result = await baseQuery(args, api, extraOptions);

  if (result.error?.status === 429) {
    const retryAfter = result.error.data?.error?.retryAfter ?? 60;

    // Show a toast with countdown
    toast.error(`Rate limited. Please wait ${retryAfter} seconds before retrying.`);

    // Do NOT automatically retry 429s — respect the server's limit
    return result;
  }

  return result;
};

// In components — show remaining attempts or retry countdown:
function LoginForm() {
  const [login, { error, isLoading }] = useLoginMutation();

  const errorMessage = error
    ? (error as any).data?.error?.message ?? 'Login failed'
    : null;

  const isRateLimited = (error as any)?.status === 429;

  return (
    <form onSubmit={handleSubmit}>
      {/* ... fields ... */}
      {errorMessage && (
        <p className={`text-sm ${isRateLimited ? 'text-[var(--warning-color)]' : 'text-[var(--negative-color)]'}`}>
          {errorMessage}
        </p>
      )}
      <button className="btn btn--primary btn--md w-full" disabled={isLoading || isRateLimited}>
        {isLoading ? 'Signing in…' : isRateLimited ? 'Too many attempts — wait' : 'Sign in'}
      </button>
    </form>
  );
}
```

---

## Checklist

- [ ] `RedisStore` used for rate limiting — never in-memory (silent failure under PM2 cluster/load balancer)
- [ ] Auth routes: 50 req / 15 min (stricter)
- [ ] General API: 100 req / 60 sec (per authenticated userId, not IP)
- [ ] Heavy ops (export, import, bulk): 10 req / 60 sec (per organizationId)
- [ ] `RateLimit-*` standard headers enabled — browsers can read `RateLimit-Reset`
- [ ] 429 response has `retryAfter` seconds in body — not just a generic message
- [ ] Login account lockout after 5 failed attempts — 30-minute lockout
- [ ] Frontend shows "wait X seconds" message on 429 — not a generic error
- [ ] Rate limit keys use userId for authenticated routes (office IPs share one IP)
- [ ] Health check endpoint excluded from rate limiting
