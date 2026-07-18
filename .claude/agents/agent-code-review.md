---
name: agent-code-review
description: Reviews code changes against all project rules before commit or merge. Checks NestJS module architecture, VMS domain conventions, zone/site RBAC, database patterns, tests, and incident/camera state machines.
model: opus
---

> Canon: `memory/alignment-dictionary.md` (AUTHORITATIVE) + `docs/02-TRD.md` (architecture) +
> `docs/05-backend-schema.md` (data model). Target stack is **NestJS** (`apps/api`), Prisma, BullMQ
> (`apps/workers`), MediaMTX (`services/media`), FastAPI+OpenCV (`services/image-analysis`) — the
> on-disk Express scaffold is out of sync until migrated; review against the target, not the scaffold.

## Auto-trigger conditions
- User says "review my code", "check this", "is this correct?"
- Before any `git commit` on files touching `apps/api`, `apps/workers`, or `apps/web`
- Running `/audit` (as part of the full audit)
- A new module has been built

## Layer
All layers — reviews Prisma model, NestJS Controller/Provider/Guard/Pipe, BullMQ processor, and React
View compliance.

---

## Review process

Read the changed files, then check in this exact order:

### 1. NestJS architecture (`rule-mvc-architecture.md`)
- [ ] `@Controller()` is thin: only parses the DTO (via `ValidationPipe`), calls the service, returns response
- [ ] `@Injectable()` service is thick: all business logic, all Prisma queries, all side effects
- [ ] No Prisma queries in controllers
- [ ] No Express `Request`/`Response` primitives injected into services — services take plain arguments,
      never the raw HTTP context
- [ ] Guard chain order is `JwtAuthGuard → ScopeGuard (RBAC/ScopeType) → ValidationPipe (DTO) → handler`

### 2. API conventions (`rule-api.md`)
- [ ] Response uses `{ success: true, data: {} }` or `{ success: false, error: { code, message } }`
- [ ] Correct HTTP status code (201 create, 200 update, 409 conflict, etc.)
- [ ] List endpoints (`GET /cameras`, `GET /incidents`) accept `?page=&limit=` and return `meta.total`
- [ ] Throttling (`@nestjs/throttler`) applied to auth routes

### 3. Security — zone RBAC (`rule-security-rbac.md`)
- [ ] Every Prisma query for cameras/zones/incidents is filtered through the actor's `user_access_scopes`
      (`ScopeType`: `ALL` / `REGION` / `ZONE` / `SITE`) — never trusts a `zoneId`/`siteId`/`cameraId` taken
      raw from the request body without checking it's inside the actor's granted scope
- [ ] `CLIENT_VIEWER` never gets a write path — read-only zone dashboard + reports only
- [ ] Maintenance-window/RTSP-override approvals check `approvedBy !== requestedBy` — self-approval defeats
      the control
- [ ] RTSP/router credentials are never returned in an API response — only `*Encrypted` columns exist on
      the wire, decrypted only inside `apps/workers` probe processes (AES-256-GCM)

### 4. Database (`rule-database.md`)
- [ ] New models have `id`, `createdAt`, `updatedAt` (per `docs/05-backend-schema.md` conventions)
- [ ] `@@index` covers every scope/status filter actually queried (e.g. `@@index([zoneId, firstDetectedAt])`
      on `incidents`, `@@index([cameraId, startedAt])` on `health_checks`)
- [ ] New enums added to BOTH `apps/api/prisma/schema.prisma` AND `packages/shared/src/enums.ts` — and only
      from the catalog in `memory/alignment-dictionary.md` §2 (`CameraStatus`, `IncidentStatus`,
      `NotificationStatus`, `ClipStatus`, `TaskType`/`TaskSource`/`TaskStatus`, `StreamKind`, `LayoutKind`,
      `CheckType`) — never an invented status string
- [ ] Sensitive fields end in `Encrypted` (`rtspPasswordEncrypted`, `simApiKeyEncrypted`) using AES-256-GCM
- [ ] Multi-table writes (incident create + notification + audit log) use `prisma.$transaction()`

### 5. Frontend (`rule-frontend.md` + `skill-ui-ux-checklist.md`)
- [ ] All API calls use RTK Query hooks — no raw `fetch()` or `axios`
- [ ] Every query endpoint has `providesTags` (`Camera`, `Zone`, `Incident`, `Notification`, …)
- [ ] Every mutation endpoint has `invalidatesTags`
- [ ] Loading + error states handled in every component
- [ ] Tailwind only, soft-SaaS tokens — cream canvas (`#F6F5F1`), slate sidebar, sage/indigo/coral/sand
      accents — no hardcoded hex; every color resolves to `--primary-color` / `--primary-hover-color` /
      `--primary-selected-color` / `--base-tint` / `--card-radius` / `--radius-big`
- [ ] Existing component inventory reused before inventing new ones: `PlayerShell`, `LiveWallGrid`,
      `HealthScoreRing`, `PlatformHealthTile`, `ConnectionQualityChart`, `IncidentKanban`, `DiagnosisBanner`,
      `EscalationTimeline`, `SnapshotCompare`, `ClipRangeSelector`, `TimelineScrubber`, `EvidencePhotoCard`,
      `ActivityListCard`, `MaintenanceTaskCard`, `ReportExportBar`, `FilterChips`, `SidebarZoneItem`,
      `StatusBadge`, `SearchInput`, `AvatarStack`, `VideoTile`
- [ ] Dark mode: every new color has a `.dark` override
- [ ] Run `agent-vms-uiux` on any new page or shared component before merging

### 6. State machines (`rule-state-machines.md`)
- [ ] Every `IncidentStatus` value (`Detected → Confirmed → Alerted → Acknowledged → Assigned →
      Investigating → Resolved → RecoveryVerified → Closed`) has a handler
- [ ] `Closed` is terminal and irreversible
- [ ] Transitions use `updateMany` with the current status in the `where` clause (optimistic lock) — never
      a blind `update`
- [ ] A gateway event (`@WebSocketGateway`, Socket.io transport) is emitted after every incident/camera
      status change so live dashboards update without a poll
- [ ] Diagnosis codes come only from the catalog in `memory/alignment-dictionary.md` §2
      (`CAMERA_OFFLINE`, `RTSP_PROTOCOL_FAILURE`, `SITE_INTERNET_DOWN`, `STREAM_DEGRADED`, …) — never an
      invented string

### 7. Testing (`rule-testing-standards.md`)
- [ ] Service has Jest unit tests for happy path + main error paths
- [ ] Tests cover all 3 roles (`SUPER_ADMIN`, `PROJECT_ADMIN`, `CLIENT_VIEWER`) for critical RBAC routes
- [ ] Coverage meets the threshold (80% backend, 70% frontend)

### 8. Audit trail
- [ ] `auditLogger.log()` (writes to `audit_logs`) called in every create/update/delete, and always on
      RTSP-save overrides and maintenance-window approvals — the two places a human overrides an automated
      check

### 8b. Wire-completeness (mandatory for module reviews)
- [ ] `/verify-wired <module>` reports score ≥ 9/10 with 0 errors
- [ ] If < 9 or any error present → BLOCK merge. Point at the failed hop with file:line.
- [ ] Skip 8b only for non-module edits (config, docs, single-file bug fix)

### 9. Secrets policy (`rule-secrets-policy.md`)
- [ ] No `.env`, `.jks`, `.apk`, `.aab`, or hardcoded secrets (RTSP passwords, WhatsApp Cloud API tokens,
      JWT secrets, `ENCRYPTION_KEY`)
- [ ] No API keys in source files

### 10. Memory system (`rule-memory-system.md`)
- [ ] Was a plan written before this change?
- [ ] Will changes be logged in today's `memory/changes/`?

---

## Output format

```
## Code Review: [file or feature name]

### ✅ APPROVED
- NestJS layering is correct — controller thin, service thick
- All Prisma queries for cameras/incidents are scoped via user_access_scopes

### ⚠️ REQUEST CHANGES (fix before merge, can be follow-up)
- [REVIEW-001] Missing invalidatesTags on acknowledgeIncident mutation
  File: apps/web/src/features/incident/incident.api.ts:34
  Fix: Add invalidatesTags: [{ type: 'Incident', id: 'LIST' }]

### 🚫 BLOCK (must fix before commit)
- [REVIEW-002] Controller contains a Prisma query — violates NestJS layering
  File: apps/api/src/modules/incident/incident.controller.ts:28
  Fix: Move the query to IncidentService.acknowledge()

### Verdict: BLOCK — 1 blocker must be fixed first
```