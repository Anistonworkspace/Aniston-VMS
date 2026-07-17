# Skill — Error Handling Patterns

Enterprise-level error handling: typed errors in services, safe API responses, frontend error decoding.

---

## Backend — AppError class hierarchy (already in boilerplate)

```typescript
// backend/src/middleware/errorHandler.ts — already exists, do NOT recreate
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public code: string,
  ) { super(message); this.name = 'AppError'; }
}

export class NotFoundError     extends AppError { constructor(msg = 'Not found')              { super(msg, 404, 'NOT_FOUND'); } }
export class ConflictError     extends AppError { constructor(msg = 'Already exists')          { super(msg, 409, 'CONFLICT'); } }
export class ValidationError   extends AppError { constructor(msg = 'Validation failed')       { super(msg, 400, 'VALIDATION_ERROR'); } }
export class UnauthorizedError extends AppError { constructor(msg = 'Not authenticated')       { super(msg, 401, 'UNAUTHORIZED'); } }
export class ForbiddenError    extends AppError { constructor(msg = 'Access denied')           { super(msg, 403, 'FORBIDDEN'); } }
export class RateLimitError    extends AppError { constructor(msg = 'Too many requests')       { super(msg, 429, 'RATE_LIMITED'); } }
export class ServerError       extends AppError { constructor(msg = 'Internal server error')   { super(msg, 500, 'SERVER_ERROR'); } }
export class GoneError         extends AppError { constructor(msg = 'Resource no longer avail') { super(msg, 410, 'GONE'); } }
export class UnprocessableError extends AppError { constructor(msg = 'Unprocessable entity')  { super(msg, 422, 'UNPROCESSABLE'); } }
```

---

## Which error to throw — decision table

| Situation | Throw |
|-----------|-------|
| Record not found (by ID) | `NotFoundError('Item not found')` |
| Record soft-deleted (deletedAt != null) | `NotFoundError('Item not found')` |
| Unique constraint violation (email duplicate) | `ConflictError('Email already registered')` |
| Wrong org (IDOR attempt) | `NotFoundError` — never reveal it exists |
| User not authenticated (no/invalid token) | `UnauthorizedError` |
| User authenticated but missing permission | `ForbiddenError('You cannot approve your own request')` |
| Self-approval attempt | `ForbiddenError('Self-approval is not allowed')` |
| Status transition not allowed | `UnprocessableError('Cannot approve a rejected request')` |
| Race condition (optimistic lock miss) | `ConflictError('Request was already processed')` |
| Invalid file type / size | `ValidationError('Only PDF and JPEG allowed, max 5MB')` |
| External API failed | `ServerError` (log internally, safe message externally) |

---

## Handling Prisma errors — map to AppError

```typescript
// backend/src/utils/handlePrismaError.ts
import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError, ServerError } from '../middleware/errorHandler.js';

export function handlePrismaError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        // Unique constraint violation
        const field = (err.meta?.target as string[])?.join(', ') ?? 'field';
        throw new ConflictError(`A record with this ${field} already exists`);
      }
      case 'P2025':
        // Record not found (e.g. update/delete on non-existent ID)
        throw new NotFoundError('Record not found');
      case 'P2003':
        // Foreign key constraint failure
        throw new ConflictError('Related record does not exist');
      case 'P2014':
        // Required relation violation
        throw new ConflictError('Cannot delete — other records depend on this');
      default:
        throw new ServerError('Database operation failed');
    }
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    throw new ServerError('Invalid database query');
  }
  throw err;  // re-throw AppError or unknown
}
```

```typescript
// Usage in any service method
try {
  const record = await prisma.item.create({ data });
} catch (err) {
  handlePrismaError(err);   // converts Prisma errors → AppError
}
```

---

## Global error handler middleware (already in boilerplate)

```typescript
// backend/src/middleware/errorHandler.ts — the catch-all
export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }

  // Zod validation errors from validateRequest middleware
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        fields: err.flatten().fieldErrors,   // maps field name → error array
      },
    });
  }

  // Unknown — log internally, never expose
  logger.error('[Unhandled error]', { error: err.message, stack: err.stack });
  return res.status(500).json({
    success: false,
    error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' },
  });
}
```

---

## Frontend — Decode error codes to user messages

```typescript
// frontend/src/lib/errorMessages.ts
const ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND:        'The requested record was not found.',
  CONFLICT:         'This record already exists.',
  VALIDATION_ERROR: 'Please check the form fields and try again.',
  UNAUTHORIZED:     'Your session has expired. Please log in again.',
  FORBIDDEN:        'You do not have permission to perform this action.',
  RATE_LIMITED:     'Too many requests. Please wait a moment.',
  SERVER_ERROR:     'Something went wrong on our end. Please try again.',
  UNPROCESSABLE:    'This action cannot be completed in the current state.',
  GONE:             'This record has been deleted.',
};

export function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'data' in err) {
    const data = (err as { data?: { error?: { code?: string; message?: string } } }).data;
    const code = data?.error?.code;
    if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
    if (data?.error?.message) return data.error.message;
  }
  return 'An unexpected error occurred. Please try again.';
}
```

---

## Frontend — Mutation error handler with toast + field errors

```typescript
// Standard mutation error handling in a component
import { getErrorMessage } from '@/lib/errorMessages';
import { toast } from '@/hooks/useToast';

const [createItem, { isLoading }] = useCreateItemMutation();

const onSubmit = async (data: CreateItemInput) => {
  try {
    await createItem(data).unwrap();
    toast.success('Item created successfully');
    onClose();
  } catch (err: unknown) {
    const message = getErrorMessage(err);

    // Check for field-level validation errors
    if (err && typeof err === 'object' && 'data' in err) {
      const fields = (err as any).data?.error?.fields;
      if (fields) {
        Object.entries(fields).forEach(([field, errors]) => {
          form.setError(field as keyof CreateItemInput, {
            message: (errors as string[])[0],
          });
        });
        return;
      }
    }

    toast.error(message);
  }
};
```

---

## RTK Query — Global 401 handler (already in boilerplate)

```typescript
// frontend/src/lib/api.ts — baseQuery with auto-refresh on 401
const baseQueryWithReauth: BaseQueryFn = async (args, api, extraOptions) => {
  let result = await baseQuery(args, api, extraOptions);

  if (result.error?.status === 401) {
    // Try silent token refresh
    const refreshResult = await baseQuery('/auth/refresh', api, extraOptions);
    if (refreshResult.data) {
      // Retry original request with new token
      result = await baseQuery(args, api, extraOptions);
    } else {
      // Refresh failed — log the user out
      api.dispatch(logout());
    }
  }

  return result;
};
```

---

## Error boundary for React (catches render errors)

```typescript
// frontend/src/components/ErrorBoundary.tsx — already in boilerplate
// Usage: wrap routes or feature pages
<ErrorBoundary fallback={<div>Something went wrong. <button onClick={() => window.location.reload()}>Reload</button></div>}>
  <ItemPage />
</ErrorBoundary>
```

---

## Checklist

- [ ] Every service method throws an `AppError` subclass — never raw `Error`
- [ ] Prisma calls in services are wrapped with `handlePrismaError`
- [ ] Controllers never contain error logic — only `try { } catch (err) { next(err); }`
- [ ] Frontend uses `getErrorMessage()` for all mutation errors
- [ ] Field-level Zod errors are mapped to `form.setError()`, not just a toast
- [ ] 401 auto-refresh is wired in RTK Query base query
- [ ] No raw Prisma errors or stack traces ever reach API consumers
- [ ] `NOT_FOUND` is thrown for wrong-org access (never `FORBIDDEN` — don't reveal existence)

---

## Result type (typed errors without exceptions)

Use `Result<T, E>` for operations where failure is expected and the caller must handle it.
Reserve thrown exceptions for programmer errors and truly unexpected failures.

```typescript
// shared/src/domain/result.ts
export type Result<T, E extends string = string> =
  | { ok: true;  value: T }
  | { ok: false; error: E; message: string };

export const Ok  = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const Err = <E extends string>(error: E, message: string): Result<never, E> => ({ ok: false, error, message });
```

```typescript
// Usage — callers MUST check .ok before using .value
type ImportError = 'DUPLICATE_EMAIL' | 'INVALID_CATEGORY' | 'QUOTA_EXCEEDED';

static async importItem(dto: CreateItemInput, actor: AuthUser): Promise<Result<Item, ImportError>> {
  const existing = await prisma.item.findFirst({
    where: { email: dto.email, organizationId: actor.organizationId, deletedAt: null },
  });
  if (existing) return Err('DUPLICATE_EMAIL', `${dto.email} already exists`);

  const category = await prisma.category.findFirst({
    where: { id: dto.categoryId, organizationId: actor.organizationId },
  });
  if (!category) return Err('INVALID_CATEGORY', `Category ${dto.categoryId} not found`);

  const item = await prisma.item.create({ data: { ...dto, organizationId: actor.organizationId } });
  return Ok(item);
}

// Caller handles all error branches — no try/catch needed
const result = await ItemService.importItem(row, actor);
if (!result.ok) {
  switch (result.error) {
    case 'DUPLICATE_EMAIL':  failures.push({ row, reason: result.message }); break;
    case 'INVALID_CATEGORY': failures.push({ row, reason: result.message }); break;
    case 'QUOTA_EXCEEDED':   throw new ConflictError(result.message); // escalate this one
  }
  continue;
}
successCount++;
```

---

## Circuit breaker for external services

Prevent cascading failures when a third-party API (email, SMS, payment) is down.

```typescript
// backend/src/lib/circuit-breaker.ts
interface CircuitBreakerOptions {
  failureThreshold: number;  // open after N consecutive failures
  recoveryTimeMs: number;    // half-open after this duration
  timeout: number;           // request timeout in ms
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private lastFailureTime = 0;

  constructor(
    private readonly name: string,
    private readonly opts: CircuitBreakerOptions = { failureThreshold: 5, recoveryTimeMs: 60_000, timeout: 5000 },
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.opts.recoveryTimeMs) {
        this.state = 'HALF_OPEN';
      } else {
        throw new ServerError(`Service ${this.name} is temporarily unavailable`);
      }
    }

    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), this.opts.timeout)),
      ]);
      // Success — reset
      this.failures = 0;
      this.state = 'CLOSED';
      return result;
    } catch (err) {
      this.failures++;
      this.lastFailureTime = Date.now();
      if (this.failures >= this.opts.failureThreshold) {
        this.state = 'OPEN';
      }
      throw err;
    }
  }
}

// One breaker per external dependency
export const emailBreaker   = new CircuitBreaker('email-service');
export const smsBreaker     = new CircuitBreaker('sms-service');
export const paymentBreaker = new CircuitBreaker('payment-gateway', { failureThreshold: 3, recoveryTimeMs: 120_000, timeout: 10_000 });

// Usage
await emailBreaker.call(() => sendgrid.send(email));
```

---

## Retry with exponential backoff + jitter

For transient failures (network blips, DB connection spikes). Never retry on 4xx errors.

```typescript
// backend/src/lib/retry.ts
interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryOn?: (err: unknown) => boolean;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const shouldRetry = opts.retryOn ?? (() => true);

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLast = attempt === opts.maxAttempts;
      if (isLast || !shouldRetry(err)) throw err;

      // Exponential backoff with jitter: 2^attempt * base ± 20% random
      const expDelay = Math.min(opts.baseDelayMs * 2 ** attempt, opts.maxDelayMs);
      const jitter = expDelay * 0.2 * (Math.random() - 0.5);
      await new Promise((r) => setTimeout(r, expDelay + jitter));
    }
  }
  throw new Error('unreachable');
}

// Usage — only retry on 5xx/network errors, not on 4xx client errors
await withRetry(
  () => fetch(webhookUrl, { method: 'POST', body: JSON.stringify(payload) }),
  {
    maxAttempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    retryOn: (err) => !(err instanceof AppError && err.statusCode < 500),
  },
);
```

---

## Dead-letter queue for failed jobs

BullMQ automatically moves failed jobs to a dead-letter queue after `maxRetriesPerJob` exhausted.

```typescript
// backend/src/jobs/workers/email.worker.ts
import { Worker } from 'bullmq';
import { redis } from '../../lib/redis.js';
import { logger } from '../../lib/logger.js';

export const emailWorker = new Worker(
  'email',
  async (job) => {
    // If this throws after all retries, job moves to failed set (the dead-letter queue)
    await emailBreaker.call(() => sendEmail(job.data));
  },
  {
    connection: redis,
    concurrency: 5,
  },
);

emailWorker.on('failed', (job, err) => {
  // Alert on permanent failure (all retries exhausted)
  logger.error('Email job permanently failed', {
    jobId: job?.id,
    jobName: job?.name,
    data: job?.data,
    error: err.message,
    attempts: job?.attemptsMade,
  });
  // Optionally: push to a human-review queue, alert via Slack, etc.
});

// Queue config — retries are defined on the queue, not the worker
// emailQueue.add('send', data, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } });
```
