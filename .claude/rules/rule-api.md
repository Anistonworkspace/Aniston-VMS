---
# API Response Rules — Aniston VMS (NestJS)
Canon: docs/02-TRD.md (API contracts) and memory/alignment-dictionary.md.

All responses MUST use the standard envelope, applied globally by a NestJS `TransformInterceptor`
(`apps/api/src/common/interceptors/transform.interceptor.ts`). Controllers return plain DTOs/entities —
never build the envelope by hand.
  Success: { "success": true, "data": {}, "meta": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 } }
  Error:   { "success": false, "error": { "code": "CAMERA_NOT_FOUND", "message": "..." } }

  Note: meta.totalPages = Math.ceil(total / limit) — always include so the frontend doesn't recompute.
  Errors are normalized by a global `AllExceptionsFilter` — thrown `AppError` subclasses (see
  rule-mvc-architecture.md) map to `error.code`; never let a raw Prisma or Node error escape it.

HTTP status codes:
  200 — GET / PATCH success (e.g. GET /cameras/:id, PATCH /incidents/:id/acknowledge)
  201 — POST (resource created, e.g. POST /cameras, POST /sites/:id/zones)
  400 — Validation error (class-validator DTO rejected the payload)
  401 — Not authenticated
  403 — Authenticated but not authorized (role or zone-scope denied — e.g. a CLIENT_VIEWER requesting a
        camera outside their assigned zone)
  404 — Resource not found (camera, zone, site, router, SIM, incident, recording)
  409 — Conflict (duplicate camera code, incident already acknowledged, optimistic-lock miss on a status update)
  429 — Rate limited
  500 — Server error (never expose stack traces or Prisma internals)

Rate limits (enforced by `@nestjs/throttler` in `apps/api`):
  Auth routes (login, refresh, forgot-password): 50 requests per 15 minutes
  All other routes: 100 requests per minute
  Worker → API callback routes (health-check results, snapshot uploads from `apps/workers`) authenticate
  with a service JWT and are exempt from the per-user throttle, but are still rate-limited per-worker

Pagination:
  All list endpoints (GET /cameras, GET /incidents, GET /zones/:id/cameras, GET /recordings, GET /audit-logs)
  MUST accept ?page=1&limit=20
  Always return meta.total AND meta.totalPages so the frontend can render pagination controls without recomputing

Domain response rules:
  - Incident payloads always include the human-facing `incidentNumber` (e.g. "ANI-CAM-2026-000145") next to
    the internal `id` — support and client teams reference incidents by number, not UUID
  - Camera payloads always include `cameraCode` (e.g. "CAM-042") next to the internal `id`
  - NEVER return a `*Encrypted` field (`rtspPasswordEncrypted`, `apiKeyEncrypted`, `simPinEncrypted`, …) in
    any response DTO — strip it at the DTO/serialization layer, not by convention alone