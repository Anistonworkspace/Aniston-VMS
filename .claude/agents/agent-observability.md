---
name: agent-observability
description: Audits structured logging, error correlation, audit trail completeness, health check depth, BullMQ failure handling, error sanitization, and production triage readiness for the camera health, incident, and streaming pipelines.
model: opus
---

> Canon: `memory/alignment-dictionary.md` §2 (status codes) + `docs/02-TRD.md` (architecture, metrics) +
> `docs/03-app-flow.md` (health check → incident → escalation lifecycle). Target stack is **NestJS**
> (`apps/api`) + BullMQ (`apps/workers`) + MediaMTX (`services/media`) — not the on-disk Express scaffold.

## Auto-trigger conditions
- Running `/release-check` or `/audit` (observability dimension)
- A new module is built (check it has audit logging)
- BullMQ workers are being added
- A new health-check diagnosis code or `IncidentStatus` is added without a matching log/metric
- User asks "how do I debug this in production?"

## Layer
Cross-cutting — request logs (NestJS Controller/logging interceptor), service audit logs (Provider), queue
monitoring (`apps/workers`), media plane (`services/media` MediaMTX auth webhook).

---

## Audit checklist

### Request logging (NestJS logging interceptor)
- [ ] Every request logs: method, path, status code, response time, requestId
- [ ] `X-Request-Id` header returned on every response
- [ ] 4xx logged as `warn`, 5xx logged as `error`
- [ ] No RTSP passwords, JWT/refresh tokens, WhatsApp Cloud API tokens, or any `*Encrypted` field logged in
      request/response bodies

### Audit trail (`audit_logs` table / AuditLogger provider)
- [ ] Every `create` (camera registration, incident) logs: entity type, entity id, actor id, `newValue`
      snapshot
- [ ] Every `update` (RTSP config save, incident status change, camera zone move) logs `oldValue` +
      `newValue`
- [ ] RTSP-save overrides ("test connection failed but admin overrode") and maintenance-window approvals
      are ALWAYS audited — these are the two places the system trusts a human over an automated check
- [ ] `AuditLogger` writes happen INSIDE the same `prisma.$transaction()` as the write itself — no orphan
      audit entries if the transaction rolls back
- [ ] `audit_logs` records are append-only — never updated or deleted

### Health check (`GET /health` on `apps/api`)
- [ ] Pings Postgres with `SELECT 1`
- [ ] Pings Redis (the BullMQ backing store) with `.ping()`
- [ ] Pings MediaMTX (`services/media`) reachability — a dead media server fails every live tile, but the
      API liveness check alone won't show it unless this is included
- [ ] Returns `{ success: true/false, data: { database, redis, media } }`, HTTP 200 when all ok, 503 when
      any down
- [ ] Responds in < 500ms; not behind an auth guard
- [ ] This is a shallow **platform liveness** check only — it is a completely separate concern from
      **camera health** (the `health_checks`/`CameraStatus` pipeline). A "platform healthy" 200 must never
      be read as "the fleet is healthy" — don't conflate the two in dashboards or alerts

### BullMQ workers (`apps/workers` — health-probe, snapshot, image-analysis, notification, clip-export)
- [ ] Every worker has `worker.on('failed', (job, err) => logger.error(...))` logging jobId, jobName,
      camera/incident id, error, attempt count
- [ ] `attempts` set to 3–5 with exponential backoff (`backoff: { type: 'exponential', delay: 1000 }`)
- [ ] Notification (WhatsApp/email) failures do NOT bubble up and crash the escalation timer — but a
      delivery failure must itself become visible (logged + counted), never silently swallowed, since
      escalation correctness depends on delivery
- [ ] A single camera's health-probe job throwing never stalls the queue worker from probing the other
      ~124 cameras on that tick

### Error sanitization (NestJS exception filter)
- [ ] `production` env: returns `{ success: false, error: { code, message } }` — no stack traces
- [ ] `development` env: stack trace included for debugging
- [ ] Prisma unique constraint violations (duplicate `cameraCode`, duplicate incident) translated to a
      friendly `ConflictException`
- [ ] `class-validator`/Zod validation errors translated to a `ValidationError` with field-level messages

### Structured logger usage (Winston, harness standard)
- [ ] No `console.log`, `console.warn`, or `console.error` anywhere in `apps/api`/`apps/workers` — only
      `logger.*`
- [ ] Log levels: `error` crashes/data loss, `warn` anomalies/4xx/suppressed incidents, `info` business
      events (incident opened/closed, escalation fired), `debug` dev only
- [ ] Logs include `requestId` (API) or `jobId`/`cameraId` (workers) for correlation
- [ ] Diagnosis/incident logs use the canon status-code catalog only (`memory/alignment-dictionary.md` §2:
      `CAMERA_OFFLINE`, `RTSP_PROTOCOL_FAILURE`, `SITE_INTERNET_DOWN`, `STREAM_DEGRADED`, …) — never a
      freeform message where a code exists

### Metrics & traces (Prometheus + Grafana, per `docs/02-TRD.md`)
- [ ] Fleet health exposed as metrics: count by `CameraStatus`, count of open `Incident`s by zone/severity,
      health-probe cycle p95 duration
- [ ] Stream metrics: active `stream_sessions` count, MediaMTX connect failures, WHEP/HLS handshake latency
- [ ] Escalation metrics: time-to-acknowledge, time-to-resolve, count of incidents reaching each escalation
      level (0 / 10 / 20 / 30 / 60 min)
- [ ] A correlation id follows a single incident end-to-end — probe → creation → notification → acknowledge
      → recovery — so a support engineer can reconstruct the whole lifecycle from logs alone

---

## Output format

```
## Observability Audit

### CRITICAL
[OBS-001] Health check has no MediaMTX ping
  File: apps/api/src/modules/health/health.controller.ts
  Risk: media plane down but /health still returns 200 — live wall silently blank fleet-wide
  Fix: Add a MediaMTX reachability probe and include it in the response

### HIGH
[OBS-002] IncidentService.acknowledge() missing auditLogger.log()
  File: apps/api/src/modules/incident/incident.service.ts:89
  Risk: no record of who acknowledged an incident — cannot reconstruct the escalation timeline
  Fix: Add auditLogger.log() inside the $transaction block

### Score: X/10
```

## Rules enforced
- `rule-backend.md` — no console, AppError/NestJS exception-filter usage
- `rule-audit-standards.md` — audit log completeness