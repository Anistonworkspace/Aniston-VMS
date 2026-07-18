---
# Logging Standards — Binding for ALL backend code (apps/api, apps/workers)
Canon: memory/alignment-dictionary.md, docs/02-TRD.md.

## The golden rule

**ZERO `console.log` in production code.** No exceptions.
Use the injected NestJS `LoggerService` (`apps/api/src/common/logger`) — or, in workers, the shared
`logger` from `packages/shared` — exclusively.

## Log levels — when to use each

| Level | When to use | Example |
|-------|------------|---------|
| `logger.error` | Unhandled exceptions, failed transactions, data loss risk | DB connection lost, health-check ingestion batch failed |
| `logger.warn` | Recoverable issues, degraded operation, expected but notable failures | Redis cache miss, a camera probe timed out once, deprecated route hit |
| `logger.info` | Normal significant events | User login, incident opened, escalation sent, BullMQ job completed |
| `logger.debug` | Developer diagnostics — DISABLED in production | Probe timing, intermediate diagnosis scoring |

## Required fields on every log call

Every log must include structured metadata (not just a string message):

```typescript
// ❌ WRONG — unstructured, unsearchable
logger.info('Incident created');
logger.error('Something went wrong: ' + err.message);

// ✅ CORRECT — structured JSON, includes requestId for correlation
logger.info('Incident created', {
  incidentNumber: incident.incidentNumber,  // e.g. "ANI-CAM-2026-000145"
  cameraId:       camera.id,
  cameraCode:     camera.cameraCode,        // e.g. "CAM-042"
  actorId:        actor.id,
  organizationId: actor.organizationId,
});

logger.error('Failed to process health-check batch', {
  error:          err.message,
  stack:          err.stack,     // only on error level
  organizationId: batch.organizationId,
  checkType:      batch.checkType,
});
```

## requestId — mandatory on all request-scoped logs

Every log emitted during an HTTP request MUST include the `requestId` from `AsyncLocalStorage`.
A `RequestIdMiddleware` (`apps/api/src/common/middleware/request-id.middleware.ts`) sets it up per request;
use the `log()` helper (not the raw logger) inside request handlers so it's auto-injected.

```typescript
// Use the helper that auto-injects requestId:
import { log } from '../../common/middleware/request-id.middleware';

// ❌ Missing requestId — cannot correlate logs to a request
logger.info('Camera updated', { cameraId: id });

// ✅ requestId auto-injected by the log() helper
log('info', 'Camera updated', { cameraId: id, actorId: actor.id });
```

## What NEVER to log

- Passwords, password hashes
- JWT access/refresh tokens
- Decrypted camera/SIM credentials or secrets (any `*Encrypted` field's decrypted value — `rtspPasswordEncrypted`,
  `apiKeyEncrypted`, `simPinEncrypted`)
- Full request/response bodies (may contain secrets)
- Stack traces in info/warn level — only on error level
- User-agent strings beyond first 100 chars

## Error logging — always include stack on server errors

```typescript
// In the global AllExceptionsFilter:
if (statusCode >= 500) {
  log('error', err.message, {
    stack:  err.stack,
    path:   req.path,
    method: req.method,
    userId: req.user?.id,
    orgId:  req.user?.organizationId,
  });
}

// For caught errors in services:
try {
  await mediaMtxClient.reload(camera.id);
} catch (err: any) {
  logger.warn('MediaMTX reload failed', {
    service:  'media',
    cameraId: camera.id,
    error:    err.message,
    // No stack — this is expected/recoverable, will retry via BullMQ
  });
}
```

## BullMQ worker logs (apps/workers) — include jobId

```typescript
worker.on('completed', (job) => {
  logger.info('Job completed', { jobId: job.id, queue: job.queueName, data: job.data });
});
worker.on('failed', (job, err) => {
  logger.error('Job failed', { jobId: job?.id, queue: job?.queueName, error: err.message, stack: err.stack });
});
```

## Log rotation (Docker `json-file` driver)

Apps log structured JSON to **stdout** — no file transports, no in-app rotation. The container
runtime owns rotation via Docker's `json-file` log driver; shipped logs land in Loki/CloudWatch
(see `skill-monitoring-patterns.md`).

```yaml
# docker-compose.fullstack.yml — per service
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "7"
```

## Checklist

- [ ] Zero `console.log/warn/error` in any `apps/api` or `apps/workers` file — ESLint rule `no-console` enabled
- [ ] All logs use structured JSON with at minimum: `message`, `level`, `timestamp`
- [ ] Request-scoped logs use `log()` helper (not the raw logger) — auto-includes `requestId`
- [ ] Error logs include `stack` field — info/warn logs do NOT
- [ ] Camera/SIM credentials and other PII never logged — decrypted secrets and passwords always excluded
- [ ] BullMQ worker logs include `jobId` and `queue` fields
- [ ] `LOG_LEVEL=debug` only in development — `LOG_LEVEL=info` in production
- [ ] Docker `json-file` log rotation configured: `max-size` 50m, `max-file` 7 (stdout only, no in-app rotation)