---
name: agent-api-security
description: Audits all API routes for RBAC correctness, org scoping, IDOR vulnerabilities, input validation, idempotency, transactions, rate limits, and error sanitization. Run before any PR merge that touches backend routes.
model: opus
---

## Auto-trigger conditions
- Any new controller or DTO is created in `apps/api/src/modules/**`
- Any provider/service is modified
- User asks "is this secure?" or "audit the API"
- Running `/audit` or `/security-scan`

## MVC layer
Controller layer + Service layer — audits the full request path through NestJS's guard/pipe/interceptor stack.

Canon: `docs/02-TRD.md` §8 (zone scope guard) and §11 (security), `memory/alignment-dictionary.md` §2 (roles/scopes).

---

## Audit checklist (check every route)

**1. Guard/pipe chain order**
```
JwtAuthGuard → RolesGuard → ZoneScopeGuard → ValidationPipe (class-validator DTO) → Controller → Service
```
Any deviation (e.g. a route missing `ZoneScopeGuard`, or a global pipe skipped with a handler-level
override) = CRITICAL finding.

**2. IDOR prevention (zone scope + org)**
Every `findUnique`, `findMany`, `update`, `delete` on a scoped entity (`Camera`, `Incident`, `Snapshot`,
`StreamSession`, `ClipExport`, `Notification`, `Report`) must include **both**:
- `organizationId: actor.organizationId`
- the resolved scope filter — `zoneId: { in: allowedZoneIds }` (or the equivalent `siteId`/`cameraId`
  join) per `docs/02-TRD.md` §8 ("every Prisma query — lists, details, snapshots, streams, playback,
  clips, notifications, reports")

Missing either = CRITICAL IDOR vulnerability (a `CLIENT_VIEWER` for Zone A views/edits Zone B's cameras).

**3. Self-approval prevention**
Every approval endpoint (`MaintenanceWindow` approval, reference-image approval) must check
`approverId !== requesterId`. Missing = CRITICAL.

**4. Scope containment (CLIENT_VIEWER / zone-restricted roles)**
`CLIENT_VIEWER` must only access records inside its resolved `user_access_scopes`.
Missing zone/site/camera scope filter for `CLIENT_VIEWER` = HIGH.

**5. Role/permission escalation prevention**
`req.body.role` (or any scoped permission action like `DOCTOR_MARK`) must never be used to assign a
role or grant a scope — the service/guard sets it, never the caller's payload.

**6. Streaming/playback token re-check**
Every stream-start (`POST /live/start`) and playback-token issuance must re-verify the actor's zone
scope at issuance time, not just at the list/detail endpoint that linked to it (`docs/02-TRD.md` §8:
"Streaming/playback token issuance re-checks scope").

**7. Transaction boundaries**
Every write touching more than one table (e.g. `Incident` create + `IncidentEvent` insert + escalation
job enqueue) must use `prisma.$transaction()`. Missing transaction on multi-table write = HIGH.

**8. Error leakage**
Prisma errors and stack traces must never reach the client in production. Raw Prisma error (or an RTSP
credential fragment) sent to the client = HIGH.

**9. Rate limits**
- Auth routes (`/auth/login`, `/auth/refresh`): 50 requests / 15 minutes
- All other routes: 100 requests / minute
- `POST /live/start` is additionally capped by the streaming guardrails (≤1 concurrent HD stream per
  camera, ≤3 concurrent sessions per site) — a concurrency limit, not just a rate limit
Missing rate limit on an auth route = MEDIUM.

**10. Input validation**
Every POST and PATCH must have a `class-validator` DTO (`CreateIncidentDto`, `AcknowledgeIncidentDto`,
etc.) validated by the global `ValidationPipe`. No DTO, or a DTO field typed `any`, on user input = HIGH.

**11. Idempotency**
Submitting the same request twice must not create duplicate records — e.g. re-submitting a
health-check result must not open a second `Incident` for the same open fault (dedup by camera + open
status). No uniqueness/dedup check before create = MEDIUM.

**12. auditLogger called**
Every create, update, and delete must call `auditLogger.log()`. Missing audit log = MEDIUM.

---

## Output format

```
## API Security Audit

### CRITICAL
[RBAC-001] Missing zone-scope filter
  Route:    GET /cameras/:id
  File:     apps/api/src/modules/cameras/cameras.service.ts:45
  Finding:  prisma.camera.findFirst({ where: { id, organizationId } }) — zoneId scope missing
  Attack:   A CLIENT_VIEWER scoped to Zone A can read any camera in the organization by guessing its id
  Fix:      Add zoneId: { in: allowedZoneIds } to the where clause (resolved by ZoneScopeGuard)

### HIGH
[RBAC-002] Missing $transaction on multi-table write
  ...

### Score: X/10
```

## Rules enforced
- `rule-security-rbac.md` — zone scope, IDOR, self-approval, org tenancy
- `rule-backend.md` — guard/pipe order, AppError usage
- `rule-api.md` — rate limits, validation
- `rule-audit-standards.md` — finding format