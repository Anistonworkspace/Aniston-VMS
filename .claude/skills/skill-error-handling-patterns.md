# Skill — Error Handling Patterns (NestJS exception filters + VMS status codes)

---

Enterprise-level error handling: typed errors, safe API responses, frontend error decoding, retry/circuit
breaker for the external dependencies a VMS leans on (RTSP/ONVIF devices, routers/SIMs, WhatsApp
notifications). Backend: `AppError` class hierarchy + a single global `AllExceptionsFilter`. Frontend:
`getErrorMessage()` maps every backend code to a human sentence — no raw stack traces reach the operator.

## AppError class hierarchy (packages/shared/src/errors.ts)

```typescript
export class AppError extends Error {
  constructor(public code: string, message: string, public statusCode: number, public fieldErrors?: Record<string, string>) {
    super(message);
  }
}

export class NotFoundError extends AppError       { constructor(m = 'Record not found') { super('NOT_FOUND', m, 404); } }
export class ForbiddenError extends AppError      { constructor(m = 'Access denied') { super('FORBIDDEN', m, 403); } }
export class UnauthorizedError extends AppError   { constructor(m = 'Not authenticated') { super('UNAUTHORIZED', m, 401); } }
export class ConflictError extends AppError       { constructor(m = 'Conflicting state') { super('CONFLICT', m, 409); } }
export class ValidationError extends AppError     { constructor(m: string, fe?: Record<string, string>) { super('VALIDATION_ERROR', m, 422, fe); } }
export class RateLimitError extends AppError      { constructor(m = 'Too many requests') { super('RATE_LIMITED', m, 429); } }
```

## VMS domain status codes (device/network health, distinct from generic HTTP errors)

```typescript
// packages/shared/src/enums.ts — surfaced by the health-check pipeline and camera/router services,
// NOT thrown as HTTP exceptions — these are CameraStatus/RouterStatus values shown in the UI and used
// by BullMQ health-check jobs to decide retry/escalation behavior.
export enum CameraStatus {
  CAMERA_REACHABLE = 'CAMERA_REACHABLE',
  RTSP_AUTHENTICATED = 'RTSP_AUTHENTICATED',
  VIDEO_HEALTHY = 'VIDEO_HEALTHY',
  RECOVERY_VERIFIED = 'RECOVERY_VERIFIED',
  CAMERA_OFFLINE = 'CAMERA_OFFLINE',
  CAMERA_TIMEOUT = 'CAMERA_TIMEOUT',
  CAMERA_PORT_CLOSED = 'CAMERA_PORT_CLOSED',
  RTSP_PROTOCOL_FAILURE = 'RTSP_PROTOCOL_FAILURE',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  INVALID_STREAM_PATH = 'INVALID_STREAM_PATH',
  WRONG_RESOLUTION = 'WRONG_RESOLUTION',
  WRONG_CODEC = 'WRONG_CODEC',
  LOW_BITRATE = 'LOW_BITRATE',
  LOW_FPS = 'LOW_FPS',
  STREAM_DEGRADED = 'STREAM_DEGRADED',
  UNSTABLE_STREAM = 'UNSTABLE_STREAM',
  IMAGE_PROBLEM = 'IMAGE_PROBLEM',
  LENS_CLEANING = 'LENS_CLEANING',
}

export enum RouterStatus {
  ROUTER_ONLINE = 'ROUTER_ONLINE',
  ROUTER_OFFLINE = 'ROUTER_OFFLINE',
  ROUTER_REBOOTED = 'ROUTER_REBOOTED',
  PORT_FORWARDING_FAILURE = 'PORT_FORWARDING_FAILURE',
  SITE_INTERNET_DOWN = 'SITE_INTERNET_DOWN',
  NETWORK_UNSTABLE = 'NETWORK_UNSTABLE',
  SIM_DISCONNECTED = 'SIM_DISCONNECTED',
  SIM_SIGNAL_ISSUE = 'SIM_SIGNAL_ISSUE',
  WEAK_SIGNAL = 'WEAK_SIGNAL',
  CONFIG_ERROR = 'CONFIG_ERROR',
}
```

## Global exception filter (apps/api/src/common/filters/all-exceptions.filter.ts)

```typescript
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();

    if (exception instanceof AppError) {
      return res.status(exception.statusCode).json({
        code: exception.code, message: exception.message, fieldErrors: exception.fieldErrors,
      });
    }
    if (exception instanceof PrismaClientKnownRequestError) {
      return res.status(this.prismaStatus(exception)).json(this.prismaBody(exception));
    }
    if (exception instanceof ZodError || exception instanceof BadRequestException) {
      return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'Invalid input', fieldErrors: toFieldErrors(exception) });
    }
    // Unknown/unhandled — log full detail server-side, never leak it to the client
    this.logger.error(exception, req.url);
    return res.status(500).json({ code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' });
  }

  private prismaStatus(e: PrismaClientKnownRequestError) {
    if (e.code === 'P2002') return 409; // unique constraint (e.g. duplicate router serial, camera name in zone)
    if (e.code === 'P2025') return 404; // record to update/delete not found
    return 500;
  }

  private prismaBody(e: PrismaClientKnownRequestError) {
    if (e.code === 'P2002') return { code: 'CONFLICT', message: `Duplicate value for ${e.meta?.target}` };
    if (e.code === 'P2025') return { code: 'NOT_FOUND', message: 'Record not found' };
    return { code: 'SERVER_ERROR', message: 'Database error' };
  }
}
```

## Circuit breaker for external dependencies (WhatsApp notification API, MediaMTX control API)

```typescript
// apps/api/src/common/lib/circuit-breaker.ts
export interface CircuitBreakerOptions { failureThreshold: number; recoveryTimeMs: number; }
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  constructor(private opts: CircuitBreakerOptions) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime < this.opts.recoveryTimeMs) {
        throw new AppError('SERVICE_UNAVAILABLE', 'External service temporarily unavailable', 503);
      }
      this.state = 'HALF_OPEN';
    }
    try {
      const result = await fn();
      this.state = 'CLOSED';
      this.failureCount = 0;
      return result;
    } catch (err) {
      this.failureCount += 1;
      this.lastFailureTime = Date.now();
      if (this.failureCount >= this.opts.failureThreshold) this.state = 'OPEN';
      throw err;
    }
  }
}

// One breaker per external dependency — a flapping WhatsApp API must never take down camera CRUD
const whatsappBreaker = new CircuitBreaker({ failureThreshold: 5, recoveryTimeMs: 60_000 });
const mediaMtxBreaker = new CircuitBreaker({ failureThreshold: 3, recoveryTimeMs: 30_000 });
```

## Retry with backoff for BullMQ jobs (camera health-check, notification dispatch)

```typescript
// apps/api/src/jobs/workers/health-check.worker.ts
export interface RetryOptions { maxAttempts: number; baseDelayMs: number; maxDelayMs: number; shouldRetry?: (err: unknown) => boolean; }

async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable = opts.shouldRetry?.(err) ?? true;
      if (attempt === opts.maxAttempts || !retryable) throw err;
      const expDelay = Math.min(opts.baseDelayMs * 2 ** (attempt - 1), opts.maxDelayMs);
      await new Promise((r) => setTimeout(r, expDelay));
    }
  }
  throw new Error('unreachable');
}

// BullMQ job options — maxRetriesPerJob mirrors withRetry's maxAttempts for jobs that don't self-retry
export const healthCheckQueueOptions: QueueOptions = {
  defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 5000 } },
};
```

## Frontend: decoding backend error codes (getErrorMessage)

```typescript
// frontend/src/lib/errorMessages.ts
export const ERROR_MESSAGES: Record<string, string> = {
  CAMERA_OFFLINE: 'This camera is currently offline.',
  RTSP_PROTOCOL_FAILURE: 'The camera rejected the stream connection. Check the RTSP path.',
  INVALID_CREDENTIALS: 'The camera credentials were rejected. Update the RTSP/ONVIF username or password.',
  SITE_INTERNET_DOWN: "This site's internet connection appears to be down.",
  SIM_SIGNAL_ISSUE: 'The router’s SIM signal is weak or unstable.',
  RATE_LIMITED: 'Too many requests — please wait a moment and try again.',
  TENANT_NOT_FOUND: 'Your session is out of date. Please sign in again.',
  VALIDATION_ERROR: 'Please check the highlighted fields.',
};

export function getErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? 'Something went wrong. Please try again.';
}
```

```typescript
// frontend/src/components/ErrorBoundary.tsx — catches render-time errors only; API errors are handled
// per-mutation via getErrorMessage(), never swallowed silently
const [createCamera, { error }] = useCreateCameraMutation();
if (error) setFormError(getErrorMessage(error.data?.code));
```

## Rules

1. Every thrown error in a service is an `AppError` subclass (or a caught `PrismaClientKnownRequestError`)
   — no bare `throw new Error('...')` reaches the filter.
2. `CameraStatus`/`RouterStatus` values (`CAMERA_OFFLINE`, `RTSP_PROTOCOL_FAILURE`, `SIM_SIGNAL_ISSUE`, ...)
   are health-check *data*, not HTTP exceptions — they're persisted and streamed to the dashboard, not
   thrown.
3. External dependencies (WhatsApp API, MediaMTX control API) are always called through their circuit
   breaker — a flapping third party degrades gracefully instead of cascading into camera/incident CRUD.
4. BullMQ jobs (health checks, notification dispatch) use exponential backoff with a capped `maxDelayMs`
   and a bounded `attempts`, never an unbounded retry loop.
5. The frontend never renders a raw error code or stack trace — `getErrorMessage()` is the only path from
   a backend `code` to user-visible text.