---
# Logging Standards — Binding for ALL backend code

## The golden rule

**ZERO `console.log` in production code.** No exceptions.
Use `logger.info/warn/error` from `backend/src/lib/logger.ts` exclusively.

## Log levels — when to use each

| Level | When to use | Example |
|-------|------------|---------|
| `logger.error` | Unhandled exceptions, failed transactions, data loss risk | DB connection lost, payment failed |
| `logger.warn` | Recoverable issues, degraded operation, expected but notable failures | Redis cache miss, rate limit near threshold, deprecated usage |
| `logger.info` | Normal significant events | User login, org created, job completed |
| `logger.debug` | Developer diagnostics — DISABLED in production | Query timing, intermediate values |

## Required fields on every log call

Every log must include structured metadata (not just a string message):

```typescript
// ❌ WRONG — unstructured, unsearchable
logger.info('Item created');
logger.error('Something went wrong: ' + err.message);

// ✅ CORRECT — structured JSON, includes requestId for correlation
logger.info('Item created', {
  entityId:       item.id,
  actorId:        actor.id,
  organizationId: actor.organizationId,
});

logger.error('Failed to process report', {
  error:          err.message,
  stack:          err.stack,     // only on error level
  organizationId: actor.organizationId,
  reportPeriod:   period,
});
```

## requestId — mandatory on all request-scoped logs

Every log emitted during an HTTP request MUST include the `requestId` from `AsyncLocalStorage`.
The `log()` utility in `backend/src/middleware/requestId.ts` injects it automatically.
Use `log()` (not `logger.info()` directly) inside request handlers.

```typescript
// Use the helper that auto-injects requestId:
import { log } from '../../middleware/requestId.js';

// ❌ Missing requestId — cannot correlate logs to a request
logger.info('Item updated', { itemId: id });

// ✅ requestId auto-injected by the log() helper
log('info', 'Item updated', { itemId: id, actorId: actor.id });
```

## What NEVER to log

- Passwords, password hashes
- JWT tokens or refresh tokens
- Decrypted PII or secrets (any `secretEncrypted` field value)
- Full request/response bodies (may contain secrets)
- Stack traces in info/warn level — only on error level
- User-agent strings beyond first 100 chars

## Error logging — always include stack on server errors

```typescript
// In global error handler:
if (statusCode >= 500) {
  log('error', err.message, {
    stack:      err.stack,
    path:       req.path,
    method:     req.method,
    userId:     req.user?.id,
    orgId:      req.user?.organizationId,
  });
}

// For caught errors in services:
try {
  await externalService.call();
} catch (err: any) {
  logger.warn('External service call failed', {
    service: 'stripe',
    error:   err.message,
    // No stack — this is expected/recoverable
  });
}
```

## BullMQ worker logs — include jobId

```typescript
worker.on('completed', (job) => {
  logger.info('Job completed', { jobId: job.id, queue: job.queueName, data: job.data });
});
worker.on('failed', (job, err) => {
  logger.error('Job failed', { jobId: job?.id, queue: job?.queueName, error: err.message, stack: err.stack });
});
```

## Log rotation (PM2)

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
```

## Checklist

- [ ] Zero `console.log/warn/error` in any backend file — ESLint rule `no-console` enabled
- [ ] All logs use structured JSON with at minimum: `message`, `level`, `timestamp`
- [ ] Request-scoped logs use `log()` helper (not `logger.info()`) — auto-includes `requestId`
- [ ] Error logs include `stack` field — info/warn logs do NOT
- [ ] PII never logged — decrypted secrets and passwords always excluded
- [ ] BullMQ worker logs include `jobId` and `queue` fields
- [ ] `LOG_LEVEL=debug` only in development — `LOG_LEVEL=info` in production
- [ ] PM2 log rotation configured: 50MB max, 7-day retention, compressed
