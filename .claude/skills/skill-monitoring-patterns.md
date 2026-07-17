# Skill — Monitoring & Observability Patterns

Winston structured logging with request ID, Sentry, health check endpoint, PM2 log rotation.

---

## Winston logger setup

```typescript
// backend/src/lib/logger.ts
import winston from 'winston';

const { combine, timestamp, json, colorize, simple } = winston.format;

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    json(),
  ),
  defaultMeta: {
    service: process.env.SERVICE_NAME ?? 'boilerplate-api',
    env:     process.env.NODE_ENV,
  },
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'development'
        ? combine(colorize(), simple())
        : combine(timestamp(), json()),
    }),
  ],
});

// PM2 log rotation sends to files — add file transport in production
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({ filename: 'logs/error.log', level: 'error' }));
  logger.add(new winston.transports.File({ filename: 'logs/combined.log' }));
}
```

---

## Request ID middleware — trace across logs

```typescript
// backend/src/middleware/requestId.ts
import { v4 as uuid } from 'uuid';
import type { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'async_hooks';

export const requestContext = new AsyncLocalStorage<{ requestId: string }>();

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.headers['x-request-id'] as string) || uuid();
  res.setHeader('x-request-id', requestId);

  requestContext.run({ requestId }, () => {
    next();
  });
}

// Updated logger — auto-injects requestId from async context
export function log(level: 'info' | 'warn' | 'error', message: string, meta?: object) {
  const ctx = requestContext.getStore();
  logger.log(level, message, { requestId: ctx?.requestId, ...meta });
}
```

---

## Request logging middleware

```typescript
// backend/src/middleware/requestLogger.ts
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    log(level, 'HTTP request', {
      method:       req.method,
      path:         req.path,
      statusCode:   res.statusCode,
      durationMs:   duration,
      userAgent:    req.headers['user-agent'],
      ip:           req.ip,
      userId:       (req as any).user?.id,
      orgId:        (req as any).user?.organizationId,
    });
  });

  next();
}
```

---

## Sentry error tracking

```typescript
// backend/src/lib/sentry.ts
import * as Sentry from '@sentry/node';

export function initSentry() {
  if (!process.env.SENTRY_DSN) return;

  Sentry.init({
    dsn:         process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [
      Sentry.prismaIntegration(),      // tracks Prisma query performance
    ],
  });
}

// Add before your routes:
// app.use(Sentry.requestHandler());
// app.use(Sentry.tracingHandler());

// Add after your routes (must be first error handler):
// app.use(Sentry.errorHandler());

// In global error handler — attach user context:
export function captureError(err: Error, req?: Request) {
  if (!process.env.SENTRY_DSN) return;

  Sentry.withScope((scope) => {
    if (req) {
      const user = (req as any).user;
      if (user) {
        scope.setUser({ id: user.id, email: user.email });
        scope.setTag('organizationId', user.organizationId);
      }
      scope.setTag('requestId', res.getHeader('x-request-id') as string);
    }
    Sentry.captureException(err);
  });
}

// Frontend Sentry:
// import * as Sentry from '@sentry/react';
// Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN, integrations: [Sentry.browserTracingIntegration()] });
```

---

## Health check endpoint

```typescript
// backend/src/modules/health/health.controller.ts
// GET /api/health — used by Docker HEALTHCHECK, load balancer, uptime monitors

export async function healthCheck(req: Request, res: Response) {
  const checks: Record<string, 'ok' | 'error'> = {
    api:      'ok',
    database: 'error',
    redis:    'error',
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {}

  try {
    await redisClient.ping();
    checks.redis = 'ok';
  } catch {}

  const allOk     = Object.values(checks).every(v => v === 'ok');
  const status    = allOk ? 200 : 503;
  const uptime    = process.uptime();
  const memory    = process.memoryUsage();

  res.status(status).json({
    status:  allOk ? 'healthy' : 'degraded',
    checks,
    uptime:  Math.floor(uptime),
    memory: {
      heapUsedMb:  Math.round(memory.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
    },
    version: process.env.npm_package_version,
    timestamp: new Date().toISOString(),
  });
}
```

---

## PM2 ecosystem config

```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name:             'boilerplate-api',
    script:           'backend/dist/server.js',
    instances:        'max',           // cluster mode — one per CPU
    exec_mode:        'cluster',
    watch:            false,
    max_memory_restart: '512M',
    env_production: {
      NODE_ENV: 'production',
      PORT:     4000,
    },
    // Log rotation via pm2-logrotate
    error_file:       'logs/pm2-error.log',
    out_file:         'logs/pm2-out.log',
    log_date_format:  'YYYY-MM-DD HH:mm:ss',
    merge_logs:       true,
  }],
};
```

```bash
# Install PM2 log rotation globally (one-time)
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

---

## Structured error log — never expose internals

```typescript
// backend/src/middleware/errorHandler.ts
export function globalErrorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? (err as AppError).statusCode : 500;

  // Log full error internally
  log(statusCode >= 500 ? 'error' : 'warn', err.message, {
    stack:    statusCode >= 500 ? err.stack : undefined,
    path:     req.path,
    method:   req.method,
    userId:   req.user?.id,
  });

  if (statusCode >= 500) captureError(err, req);

  // Return sanitized error to client — never expose stack or internal details
  res.status(statusCode).json({
    success: false,
    error: {
      code:    isAppError ? (err as AppError).code : 'INTERNAL_ERROR',
      message: isAppError ? err.message : 'An unexpected error occurred',
    },
  });
}
```

---

## Checklist

- [ ] All logs are structured JSON with `timestamp`, `level`, `requestId`, `userId`, `orgId`
- [ ] `requestIdMiddleware` runs before all routes — `x-request-id` header returned on every response
- [ ] Request logger records method, path, statusCode, durationMs for every request
- [ ] 5xx errors captured in Sentry with user context and requestId
- [ ] `/api/health` returns 200 when healthy, 503 when DB or Redis is down
- [ ] Global error handler never sends stack traces or Prisma error messages to clients
- [ ] PM2 cluster mode (`instances: "max"`) for production
- [ ] PM2 log rotation installed — 50 MB max, 7-day retention, compressed
- [ ] `SENTRY_DSN` in environment secrets — not in source code
- [ ] Frontend Sentry initialized with `browserTracingIntegration` for performance monitoring
