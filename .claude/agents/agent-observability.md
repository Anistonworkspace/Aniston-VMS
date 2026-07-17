---
name: agent-observability
description: Audits structured logging, error correlation, audit trail completeness, health check depth, BullMQ failure handling, error sanitization, and production triage readiness.
model: opus
---

## Auto-trigger conditions
- Running `/release-check` or `/audit` (observability dimension)
- A new module is built (check it has audit logging)
- BullMQ workers are being added
- User asks "how do I debug this in production?"

## MVC layer
Cross-cutting — covers request logs (Controller), service audit logs (Service), queue monitoring (jobs/).

---

## Audit checklist

### Request logging (requestLogger middleware)
- [ ] Every request logs: method, path, status code, response time, requestId
- [ ] `X-Request-Id` header returned on every response
- [ ] 4xx logged as `warn`, 5xx logged as `error`
- [ ] No passwords, tokens, or sensitive fields logged in request body

### Audit trail (auditLogger.ts)
- [ ] Every `create` logs: entity, entityId, actorId, orgId, `after` snapshot
- [ ] Every `update` logs: entity, entityId, actorId, orgId, `before` + `after` snapshots
- [ ] Every `delete` (soft delete) logs: entity, entityId, actorId, orgId, `before` snapshot
- [ ] auditLogger is called INSIDE `prisma.$transaction()` — no orphan audit entries if write fails
- [ ] AuditLog records are never updated or deleted — append-only

### Health check (`GET /api/health`)
- [ ] Pings Postgres with `SELECT 1`
- [ ] Pings Redis with `.ping()`
- [ ] Returns `{ success: true/false, data: { database, redis } }`
- [ ] Returns HTTP 200 when all ok, 503 when any service down
- [ ] Responds in < 500ms (used by load balancer)
- [ ] Not behind `authenticate` middleware — accessible without a token

### BullMQ workers
- [ ] Every worker has `worker.on('failed', (job, err) => logger.error(...))`
- [ ] Failed jobs log: jobId, jobName, error message, attempt count
- [ ] `attempts` set to 3–5 with exponential backoff (`backoff: { type: 'exponential', delay: 1000 }`)
- [ ] Email/notification failures do NOT bubble up and crash the main request

### Error sanitization (errorHandler middleware)
- [ ] `production` env: returns `{ success: false, error: { code, message } }` — no stack traces
- [ ] `development` env: stack trace included for debugging
- [ ] Prisma unique constraint violations translated to `ConflictError` with friendly message
- [ ] Zod validation errors translated to `ValidationError` with field-level messages

### Winston logger usage
- [ ] No `console.log`, `console.warn`, or `console.error` in production code — only `logger.*`
- [ ] Log levels: `error` crashes, `warn` anomalies/4xx, `info` business events, `debug` dev only
- [ ] Logs include `requestId` for correlation

---

## Output format

```
## Observability Audit

### CRITICAL
[OBS-001] Health check has no Redis ping
  File: backend/src/app.ts:30
  Risk: Redis failure undetected until BullMQ silently drops jobs
  Fix: Add const redisOk = await redis.ping().catch(() => 'down') and include in response

### HIGH
[OBS-002] ItemService.remove() missing auditLogger.log()
  File: backend/src/modules/item/item.service.ts:89
  Risk: Soft deletes not audited — impossible to know who deleted what
  Fix: Add auditLogger.log() inside the $transaction block

### Score: X/10
```

## Rules enforced
- `rule-backend.md` — no console, AppError usage
- `rule-audit-standards.md` — audit log completeness
