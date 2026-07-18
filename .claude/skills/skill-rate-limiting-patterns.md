# Skill — Rate Limiting Patterns (auth + stream endpoints)

---

Redis-backed rate limiting for multi-instance production, per-route limits, `429` responses with
`Retry-After`. Auth endpoints and camera stream endpoints get the tightest limits — the first is the
brute-force/credential-stuffing surface, the second is the surface that can pin down ffmpeg/MediaMTX
worker capacity if left uncapped. Backed by `ioredis`, applied via a NestJS guard/interceptor.

## Redis-backed limiter (apps/api/src/common/guards/rate-limit.guard.ts)

```typescript
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private redis: Redis, private reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const opts = this.reflector.get<RateLimitOptions>('rateLimit', ctx.getHandler()) ?? DEFAULT_RATE_LIMIT;
    const req = ctx.switchToHttp().getRequest<Request>();
    const key = `ratelimit:${opts.prefix}:${req.ip}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, opts.windowSeconds);
    const res = ctx.switchToHttp().getResponse<Response>();
    res.setHeader('RateLimit-Limit', opts.max);
    res.setHeader('RateLimit-Remaining', Math.max(0, opts.max - count));
    if (count > opts.max) {
      const ttl = await this.redis.ttl(key);
      res.setHeader('Retry-After', ttl);
      throw new HttpException({ code: 'RATE_LIMITED', message: `Too many requests, retry in ${ttl}s` }, 429);
    }
    return true;
  }
}
```

## Per-route limits

```typescript
// Auth — tightest limits, brute-force / credential-stuffing surface
@Post('login')
@RateLimit({ prefix: 'auth-login', windowSeconds: 15 * 60, max: 5 })   // 5 attempts / 15 min / IP
login(@Body() dto: LoginDto) { ... }

@Post('refresh')
@RateLimit({ prefix: 'auth-refresh', windowSeconds: 60, max: 20 })
refresh(@Req() req: Request) { ... }

// Live stream endpoints — cap concurrent viewer-session starts per user, protects MediaMTX worker pool
@Post('cameras/:id/stream-session')
@RateLimit({ prefix: 'stream-session', windowSeconds: 60, max: 10 })
startStreamSession(@Param('id') id: string, @CurrentUser() actor: AuthUser) { ... }

// Snapshot-on-demand — cheap per call, but pollable, so still capped
@Post('cameras/:id/snapshot')
@RateLimit({ prefix: 'snapshot', windowSeconds: 10, max: 3 })
requestSnapshot(@Param('id') id: string) { ... }

// General authenticated API — generous default so normal dashboard polling isn't affected
@RateLimit({ prefix: 'api', windowSeconds: 60, max: 300 })
```

## Account lockout after repeated failed logins (separate from the IP rate limiter)

```typescript
// apps/api/src/modules/auth/auth.service.ts
async trackLoginAttempt(email: string, success: boolean) {
  const lockKey = `login-lock:${email}`;
  if (success) {
    await this.redis.del(lockKey);
    return;
  }
  const attempts = await this.redis.incr(lockKey);
  if (attempts === 1) await this.redis.expire(lockKey, 30 * 60); // 30-minute window
  if (attempts >= 5) {
    throw new UnauthorizedException('ACCOUNT_LOCKED'); // locked regardless of source IP for 30 minutes
  }
}
```

## Frontend: surfacing 429s (RTK Query)

```typescript
// frontend/src/store/api/baseApi.ts
export const baseQueryWithRetry: BaseQueryFn = async (args, api, extraOptions) => {
  const result = await baseQuery(args, api, extraOptions);
  if (result.error?.status === 429) {
    const retryAfter = Number(result.meta?.response?.headers.get('Retry-After') ?? 30);
    api.dispatch(uiSlice.actions.showToast({
      message: `Too many requests — please wait ${retryAfter}s and try again.`,
      variant: 'warning',
    }));
  }
  return result;
};
```

```typescript
// frontend/src/features/auth/LoginForm.tsx
const [login, { error, isLoading }] = useLoginMutation();
if (error?.data?.code === 'RATE_LIMITED') {
  setErrorMessage(`Too many login attempts. Try again in ${error.data.retryAfter} seconds.`);
}
```

## Health check endpoint is exempt

```typescript
// GET /api/health must never be rate-limited — orchestrator/liveness probes hit it every few seconds
@SkipRateLimit()
@Get('health')
healthCheck() { ... }
```

## Rules

1. Rate-limit state lives in Redis, never in-process memory — the API runs behind a load balancer with
   multiple instances, and an in-memory counter resets per-instance and is trivially bypassed.
2. Every `429` sets `Retry-After` and returns `{ code: 'RATE_LIMITED', ... }` in the JSON body, not just
   the status code, so the frontend can render a countdown.
3. Auth routes (`login`, `refresh`, `forgot-password`, `reset-password`, `register`) have their own tight
   per-IP limits, plus a separate per-account lockout counter that survives IP rotation.
4. Stream-session start and on-demand snapshot endpoints are capped per user — uncapped, either one can
   exhaust the MediaMTX/ffmpeg worker pool and take down live viewing for the whole organization.
5. `GET /api/health` is explicitly exempt via `@SkipRateLimit()`.