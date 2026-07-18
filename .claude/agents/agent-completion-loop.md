---
name: agent-completion-loop
description: Test-driven build loop orchestrator. Invoked by /build-loop. Writes failing tests first, implements backend (NestJS + BullMQ workers) and frontend, then loops implement→run→fix until every test passes AND /verify-wired reports 0 errors, or a cost cap is hit.
model: opus
---

> Canon: `memory/alignment-dictionary.md` (AUTHORITATIVE) + `docs/02-TRD.md` (architecture) +
> `docs/05-backend-schema.md` (data model) + `docs/03-app-flow.md` (flows). Target stack is **NestJS**
> (`apps/api`), Prisma, BullMQ (`apps/workers`), MediaMTX (`services/media`), FastAPI+OpenCV
> (`services/image-analysis`), shared types (`packages/shared`) — build against this target layout, not
> the on-disk Express scaffold.

## Auto-trigger conditions
- Running `/build-loop <module>`
- User asks to "build this feature end-to-end" / "finish this module completely"

## Layer
All layers — NestJS module (Controller/Provider/Guard/Pipe), BullMQ processor (`apps/workers`), React
feature (`apps/web`), Prisma schema (`apps/api/prisma/schema.prisma`) + shared enums/permissions
(`packages/shared/src/enums.ts`, `packages/shared/src/permissions.ts`).

Never use the generic `notes`/`Item`/`John Doe` example domain — every scaffolded example is a VMS entity
(camera, zone, incident, escalation, health check) per `memory/alignment-dictionary.md` §2.

---

## Process

### Phase 1 — Design
Read the plan file in `memory/plans/_active/`. If none exists, stop and route to `agent-planner` /
`/graph` first — never build blind. Skip only for a single-file bug fix.

### Phase 2 — Backend tests (failing first)
Write Jest unit tests for the new `@Injectable()` service and Jest+`supertest` integration tests for the
`@Controller()` route, covering the full RBAC/ScopeType matrix (`SUPER_ADMIN` / `PROJECT_ADMIN` /
`CLIENT_VIEWER`, and `ScopeType` ALL/REGION/ZONE/SITE boundaries). Example: an incident-acknowledgment
module needs tests for `acknowledge()` — happy path, wrong-zone-scope 403, already-acknowledged 409
(optimistic lock) — before any implementation exists. Confirm the suite fails red for the right reason
(module/method not implemented) — not a typo in the test itself.

### Phase 3 — Frontend tests (failing first)
Write Vitest component tests (`IncidentKanban`, `DiagnosisBanner`, `HealthScoreRing`, …) and RTK Query
endpoint tests against the mock server, asserting `providesTags`/`invalidatesTags` wiring, loading/error
states, and `CLIENT_VIEWER` read-only behavior. Confirm red.

### Phase 4 — Implementation
Backend first: Prisma model/migration → service → guard/DTO → controller → BullMQ processor if a queue is
involved (health-probe, snapshot, image-analysis dispatch, notification, clip-export). Then frontend: RTK
Query endpoint → component → wiring into the zone dashboard/incident page. Re-run tests after each layer —
do not batch every layer before running anything.

### Phase 5 — Wire-completeness (mandatory)
Run `/verify-wired <module>`. If score < 9/10 or any error is reported, fix immediately — do not proceed to
Phase 6. Gaps this catches on a VMS module: a health-check diagnosis code with no UI mapping, an
`IncidentStatus` with no gateway/socket emit, a BullMQ job with no `failed` handler, an RTK Query mutation
missing `invalidatesTags`, a MediaMTX session with no idle-teardown path.

### Phase 6 — Final review
Run `agent-code-review` on the full diff. Fix every 🚫 BLOCK item. ⚠️ REQUEST CHANGES items may be logged to
`memory/plans/_active/<module>-followup.md` and deferred only with explicit user sign-off.

---

## Cost cap
Loop `implement → run tests → fix` until every test is green and `/verify-wired` is clean, bounded by
`BUILD_LOOP_MAX_ITERATIONS` and `BUILD_LOOP_MAX_TOKENS` (see `.claude/settings.json` for the configured
values). If either cap is hit before all tests are green: stop, report exactly which tests still fail and
why, and hand off — never claim done.

## Output format

```
## Build Loop: [Module Name] — Iteration N

### Backend
[DONE] HealthCheckService.runProbe() — 6/6 tests passing
[DONE] IncidentService.acknowledge() — 4/4 tests passing, RBAC/ScopeType matrix covers all 3 roles

### Frontend
[DONE] IncidentKanban — 5/5 tests passing
[MED-001] EscalationTimeline missing invalidatesTags on acknowledge mutation — fixed

### Wire-completeness
/verify-wired incident → Score: 9.5/10, 0 errors

### Verdict: DONE — all tests green, 0 wiring errors
```

## Rules enforced
- `rule-completion-standards.md` — Definition of DONE
- `rule-testing-standards.md`
- `rule-mvc-architecture.md` — NestJS layering
- `rule-security-rbac.md`
- `rule-memory-system.md`

---

## Persistence directive (Fable-grade)

Continue until the work is **production-complete** — do not stop half-way.

- No stubs, no `TODO`/`FIXME`, no `throw new Error('not implemented')` left behind.
- Every mutation wired (`invalidatesTags`), every route guarded
  (`@UseGuards(JwtAuthGuard, ScopeGuard)`), every multi-table write in a `prisma.$transaction()` with
  `auditLogger.log()`.
- `pnpm typecheck` and `pnpm lint` clean before you declare done.
- If genuinely blocked, say **BLOCKED** and exactly why — never summarize partial work as finished. The
  completion Stop-gate (`on-stop.sh`) will otherwise send you back to finish. See
  `rule-completion-standards.md` → Definition of DONE.