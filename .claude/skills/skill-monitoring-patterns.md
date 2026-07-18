# Skill — Monitoring & Observability Patterns

Structured NestJS logging with request-id correlation, Sentry error tracking, Prometheus metrics, Grafana
dashboards, and a Terminus **platform-liveness** health endpoint. Aniston VMS runs two distinct observability
planes and they must never be conflated: **platform liveness** (is `aniston-vms-api` / `apps/workers` /
Postgres / Redis / MediaMTX / `services/image-analysis` up?) and **camera-health scoring** (the 5-stage
RTSP/ONVIF/router/SIM diagnostic pipeline). A perfectly green platform can still be watching a dozen offline
cameras.

See `docs/02-TRD.md` (logging, health-check & metrics requirements), `.claude/rules/rule-logging-standards.md`
(log levels, required fields, redaction policy), `docs/05-backend-schema.md` (`HealthCheck` / `Incident`
models surfaced in metrics) and `memory/alignment-dictionary.md` (service names + diagnostic status-code
catalog) for the canonical rules this skill implements.

---

## Two observability planes — do not conflate them

| Plane | Question it answers | Source | Surfaced by |
| --- | --- | --- | --- |
| **Platform liveness** | Is the Aniston VMS *infrastructure* up? | Terminus `GET /health`, process/HTTP metrics | Uptime monitors, load balancer, Grafana "Platform" board |
| **Camera-health scoring** | Is each *camera* streaming cleanly? | 5-stage probe pipeline → `HealthCheck` → `Incident` | `PlatformHealthTile`, `HealthScoreRing`, Grafana "Fleet" board |

Platform liveness is an infra concern (`apps/api`, `apps/workers`, Postgres, Redis, MediaMTX,
`services/image-analysis`). Camera-health scoring is the **domain** pipeline documented in `docs/02-TRD.md` /
`docs/03-app-flow.md`: a camera flips `CAMERA_OFFLINE`, a `HealthCheck` row opens an `Incident`
(`ANI-CAM-2026-000145`), the escalation timeline fires WhatsApp/email notifications, and an operator marks
`RECOVERY_VERIFIED`. Both planes are graphed in Grafana, but they are never the same signal — an offline
camera is fleet state, not an infra outage.

---

## NestJS LoggerService — structured JSON, one instance app-wide

```typescript
// apps/api/src/common/logger/app-logger.service.ts
import { Injectable, LoggerService } from '@nestjs/common';
import winston from 'winston';
import { requestContext } from '../middleware/request-id.middleware';

const { combine, timestamp, json, colorize, simple } = winston.format;

@Injectable()
export class AppLogger implements LoggerService {
  private readonly winston = winston.createLogger({
    level: process.env.LOG_LEVEL ?? 'info',            // LOG_LEVEL=debug in dev, LOG_LEVEL=info in prod
    defaultMeta: {
      service: process.env.SERVICE_NAME ?? 'aniston-vms-api',
      env:     process.env.NODE_ENV,
    },
    format: process.env.NODE_ENV === 'production'
      ? combine(timestamp(), json())                   // machine-readable → stdout → Loki/CloudWatch
      : combine(colorize(), simple()),
    transports: [new winston.transports.Console()],    // containers log to stdout only; the runtime collects it
  });

  private write(level: string, message: string, meta: object = {}) {
    // auto-correlate every line with the in-flight request
    const ctx = requestContext.getStore();
    this.winston.log(level, message, {
      requestId:      ctx?.requestId,
      userId:         ctx?.userId,
      organizationId: ctx?.organizationId,
      ...meta,
    });
  }

  log(message: string, meta?: object)   { this.write('info',  message, meta); }
  warn(message: string, meta?: object)  { this.write('warn',  message, meta); }
  error(message: string, meta?: object) { this.write('error', message, meta); }
  debug(message: string, meta?: object) { this.write('debug', message, meta); }
}
```

```typescript
// apps/api/src/main.ts — make the JSON logger the app-wide LoggerService (Nest's own logs flow through it too)
const app = await NestFactory.create(AppModule, { bufferLogs: true });
const appLogger = app.get(AppLogger);
app.useLogger(appLogger);
registerLogger(appLogger);   // wire the request-scoped log() helper (below)
```

> `apps/workers` is not request-scoped — it imports the shared `logger` from `@aniston-vms/shared` directly and
> always attaches `jobId` + `queue`. Zero `console.log` anywhere (`.claude/rules/rule-logging-standards.md`).

---

## Request-id middleware — trace one request across api + workers

```typescript
// apps/api/src/common/middleware/request-id.middleware.ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { AppLogger } from '../logger/app-logger.service';

// Adapter-agnostic req/res shapes — keeps these snippets independent of the underlying HTTP driver.
type Req  = { headers: Record<string, string | string[] | undefined>; user?: { id: string; organizationId: string } };
type Res  = { setHeader(name: string, value: string): void };
type Next = () => void;

export const requestContext = new AsyncLocalStorage<{
  requestId: string;
  userId?: string;
  organizationId?: string;
}>();

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Req, res: Res, next: Next) {
    const header = req.headers['x-request-id'];
    const requestId = (Array.isArray(header) ? header[0] : header) ?? randomUUID();
    res.setHeader('x-request-id', requestId);
    // JwtAuthGuard runs after middleware, so userId/orgId are backfilled by the LoggingInterceptor.
    requestContext.run({ requestId }, () => next());
  }
}

// The request-scoped helper referenced by rule-logging-standards.md — requestId auto-injected via getStore().
let appLogger: AppLogger;
export function registerLogger(l: AppLogger) { appLogger = l; }
export function log(level: 'info' | 'warn' | 'error' | 'debug', message: string, meta?: object) {
  appLogger[level === 'info' ? 'log' : level](message, meta);
}
```

---

## Request logging interceptor — method, path, status, duration

NestJS records request telemetry with an interceptor (not per-route middleware):

```typescript
// apps/api/src/common/interceptors/logging.interceptor.ts
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { requestContext, log } from '../middleware/request-id.middleware';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = Date.now();
    const http = ctx.switchToHttp();
    const req = http.getRequest<{
      method: string; url: string; headers: Record<string, string>;
      user?: { id: string; organizationId: string };
    }>();

    // Backfill the async-context store with the authenticated actor for downstream logs.
    const store = requestContext.getStore();
    if (store && req.user) { store.userId = req.user.id; store.organizationId = req.user.organizationId; }

    return next.handle().pipe(
      tap(() => {
        const res = http.getResponse<{ statusCode: number }>();
        const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
        log(level, 'HTTP request', {
          method:     req.method,
          path:       req.url,
          statusCode: res.statusCode,
          durationMs: Date.now() - start,
          userAgent:  req.headers['user-agent']?.slice(0, 100),   // capped per redaction policy
        });
      }),
    );
  }
}
```

Register it globally in `AppModule` via `{ provide: APP_INTERCEPTOR, useClass: LoggingInterceptor }`.

---

## Sentry error tracking (`@sentry/nestjs`)

Use the framework SDK `@sentry/nestjs`; instrument BEFORE the app module is imported.

```typescript
// apps/api/src/instrument.ts — the very first import in main.ts
import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn:              process.env.SENTRY_DSN,             // secret — env only, never committed to source
  environment:      process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  integrations:     [Sentry.prismaIntegration()],      // Prisma query spans
});
```

```typescript
// apps/api/src/main.ts
import './instrument';                 // MUST be first — before NestFactory and AppModule
import { NestFactory } from '@nestjs/core';
```

```typescript
// apps/api/src/common/filters/sentry.util.ts — attach actor + request context on 5xx
import * as Sentry from '@sentry/nestjs';
import { requestContext } from '../middleware/request-id.middleware';

export function captureError(err: Error, user?: { id: string; email: string; organizationId: string }) {
  if (!process.env.SENTRY_DSN) return;
  Sentry.withScope((scope) => {
    if (user) {
      scope.setUser({ id: user.id, email: user.email });
      scope.setTag('organizationId', user.organizationId);
    }
    scope.setTag('requestId', requestContext.getStore()?.requestId);
    Sentry.captureException(err);
  });
}
```

```typescript
// apps/web/src/lib/sentry.ts — frontend
import * as Sentry from '@sentry/react';
Sentry.init({
  dsn:              import.meta.env.VITE_SENTRY_DSN,
  integrations:     [Sentry.browserTracingIntegration()],   // performance + route timing
  tracesSampleRate: 0.1,
});
```

---

## AllExceptionsFilter — sanitized errors, full detail only in logs

```typescript
// apps/api/src/common/filters/all-exceptions.filter.ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { log } from '../middleware/request-id.middleware';
import { captureError } from './sentry.util';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const res  = http.getResponse<{ status(code: number): { json(body: unknown): void } }>();
    const req  = http.getRequest<{ url: string; method: string; user?: { id: string; email: string; organizationId: string } }>();

    const isHttp     = exception instanceof HttpException;
    const statusCode = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const err        = exception instanceof Error ? exception : new Error('Unknown error');

    // Full internal detail — stack only on 5xx (rule-logging-standards.md).
    log(statusCode >= 500 ? 'error' : 'warn', err.message, {
      stack:  statusCode >= 500 ? err.stack : undefined,
      path:   req.url,
      method: req.method,
    });
    if (statusCode >= 500) captureError(err, req.user);

    // Sanitized body to the client — never a stack trace or a raw Prisma/database message.
    const body = isHttp
      ? exception.getResponse()
      : { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' };
    res.status(statusCode).json({ success: false, error: body });
  }
}
```

---

## Platform-liveness health endpoint — `@nestjs/terminus`

`GET /health` answers **liveness of the platform**, not the camera fleet. It is what the Docker `HEALTHCHECK`,
the load balancer, and uptime monitors poll.

```typescript
// apps/api/src/modules/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HttpHealthIndicator, PrismaHealthIndicator } from '@nestjs/terminus';
import { Public } from '../../common/decorators/public.decorator';   // liveness probe carries no JWT
import { PrismaService } from '../../prisma/prisma.service';
import { RedisHealthIndicator } from './redis.health';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly http:   HttpHealthIndicator,
    private readonly db:     PrismaHealthIndicator,
    private readonly redis:  RedisHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('postgres', this.prisma),
      () => this.redis.isHealthy('redis'),
      // MediaMTX (services/media) — the streaming plane
      () => this.http.pingCheck('mediamtx', `${process.env.MEDIAMTX_API_URL}/v3/config/global/get`),
      // FastAPI + OpenCV image-analysis (services/image-analysis)
      () => this.http.pingCheck('image-analysis', `${process.env.IMAGE_ANALYSIS_URL}/healthz`),
    ]);
  }
}
```

Terminus returns `200 { status: 'ok', ... }` when every indicator passes and `503 { status: 'error' }` when
any is down — so a dead Redis, an unreachable MediaMTX, or a wedged `services/image-analysis` surfaces
immediately.

> A camera going `CAMERA_OFFLINE` must NEVER flip `/health` to 503 — that is fleet state tracked in the
> `HealthCheck` / `Incident` tables and exported as Prometheus gauges below, not an infra failure.

---

## Prometheus metrics — expose both planes

```typescript
// apps/api/src/modules/metrics/registry.ts
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry });   // event-loop lag, heap, GC — the platform plane baseline

// ── Platform-liveness metrics ──────────────────────────────────────────────
export const httpDuration = new Histogram({
  name:       'aniston_vms_http_request_duration_seconds',
  help:       'HTTP request duration by route + status',
  labelNames: ['method', 'route', 'status'] as const,
  registers:  [registry],
});

export const jobOutcomes = new Counter({
  name:       'aniston_vms_bullmq_jobs_total',
  help:       'BullMQ jobs by queue + outcome',
  labelNames: ['queue', 'outcome'] as const,       // completed | failed
  registers:  [registry],
});

// ── Camera-health-scoring metrics (the fleet plane) ────────────────────────
export const camerasByStatus = new Gauge({
  name:       'aniston_vms_cameras_by_status',
  help:       'Camera count grouped by CameraStatus',
  labelNames: ['organizationId', 'status'] as const,   // CAMERA_OFFLINE, CAMERA_REACHABLE, STREAM_DEGRADED, ...
  registers:  [registry],
});

export const openIncidents = new Gauge({
  name:       'aniston_vms_open_incidents',
  help:       'Open incidents grouped by diagnosis code',
  labelNames: ['organizationId', 'code'] as const,     // SITE_INTERNET_DOWN, RTSP_PROTOCOL_FAILURE, ...
  registers:  [registry],
});

export const probeDuration = new Histogram({
  name:       'aniston_vms_health_probe_seconds',
  help:       'Per-stage camera health-probe duration',
  labelNames: ['checkType'] as const,                  // RTSP | ONVIF | ROUTER | SIM
  registers:  [registry],
});
```

```typescript
// apps/api/src/modules/metrics/metrics.controller.ts
@Controller('metrics')
export class MetricsController {
  @Get()
  @Public()
  async scrape(@Res() res: { setHeader(k: string, v: string): void; end(body: string): void }) {
    res.setHeader('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  }
}
```

Refresh the fleet gauges on a schedule — a `@Cron` in `apps/api` or a `metrics-refresh` BullMQ job in
`apps/workers` — so the numbers reflect current `Camera` / `Incident` rows:

```typescript
const grouped = await this.prisma.camera.groupBy({ by: ['status'], where: { organizationId }, _count: true });
for (const g of grouped) camerasByStatus.set({ organizationId, status: g.status }, g._count);
```

---

## Grafana dashboards — one board per plane

- **Platform board** — `aniston_vms_http_request_duration_seconds` p95, 5xx rate,
  `aniston_vms_bullmq_jobs_total` failure ratio + queue depth, Postgres/Redis liveness from `/health`,
  container CPU/memory. Alert when any `/health` indicator is down > 1 min or the 5xx rate exceeds 2%.
- **Fleet board** — `aniston_vms_cameras_by_status` stacked by `CameraStatus`, `aniston_vms_open_incidents`
  by code, probe p95 by `checkType`, mean-time-to-`RECOVERY_VERIFIED`. Alert when offline cameras in a zone
  cross the org threshold or a `SITE_INTERNET_DOWN` fires for any site.

Grafana reads Prometheus for both. A green Platform board sitting next to a red Fleet board is a normal,
meaningful state: the infrastructure is fine and the cameras are not.

---

## Deployment & log shipping — containers, not a process manager

Aniston VMS ships as containers (`apps/api`, `apps/workers`, `services/media`, `services/image-analysis`)
under Docker Compose in dev and an orchestrator in prod. There is **no in-process supervisor**:

- Each service logs structured JSON to **stdout**; the container runtime forwards it to Loki/CloudWatch.
  No file transports, no in-app log rotation — retention and sampling live in the log platform.
- Restarts, replicas, and zero-downtime rollouts are the orchestrator's job (Compose `restart: unless-stopped`,
  or Deployment replicas + rolling updates). Scale `apps/api` horizontally by adding replicas.
- Container liveness/readiness probes hit `GET /health`; MediaMTX and `services/image-analysis` expose their
  own probes and are checked from that endpoint too.

---

## Checklist

- [ ] `AppLogger implements LoggerService`, wired via `app.useLogger()` — zero `console.log` in `apps/api` / `apps/workers`
- [ ] All logs are structured JSON with `timestamp`, `level`, `requestId`, `userId`, `organizationId`
- [ ] `RequestIdMiddleware` sets `x-request-id` (echoed on every response) and seeds `AsyncLocalStorage`
- [ ] `LoggingInterceptor` records method, path, statusCode, durationMs per request
- [ ] `AllExceptionsFilter` never leaks stack traces or Prisma/database messages; 5xx captured in Sentry with actor + requestId
- [ ] Decrypted `*Encrypted` credentials, JWT tokens and passwords are never logged (redaction policy)
- [ ] `GET /health` (Terminus) checks Postgres, Redis, MediaMTX and `services/image-analysis`; 503 when any is down
- [ ] Platform liveness (`/health`) stays separate from camera-health scoring — an offline camera never flips `/health`
- [ ] Prometheus `/metrics` exposes both planes: platform histograms/counters + fleet gauges (`cameras_by_status`, `open_incidents`, probe durations)
- [ ] Grafana has a Platform board and a Fleet board, each alerting on its own plane
- [ ] Service name is `aniston-vms-api`; `SENTRY_DSN` / `VITE_SENTRY_DSN` live in env secrets, not in source
- [ ] Containers log to stdout → Loki/CloudWatch; restarts and replicas are handled by the orchestrator, not an in-app supervisor
- [ ] `LOG_LEVEL=debug` only in development; `LOG_LEVEL=info` in production
