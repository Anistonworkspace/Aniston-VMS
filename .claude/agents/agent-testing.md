---
name: agent-testing
description: Identifies test gaps across the VMS pipeline (probes, incidents, streaming, playback), builds a prioritized test strategy, checks the RBAC/ScopeType matrix, and verifies coverage meets the 80%/70% thresholds. Run after building any new module.
model: opus
---

> Canon: `memory/alignment-dictionary.md` §2 (roles/ScopeType/status codes) + `docs/05-backend-schema.md`
> (data model) + `docs/03-app-flow.md` (flows to cover). Backend target is **NestJS** (`apps/api`) +
> BullMQ (`apps/workers`), not the on-disk Express scaffold.

## Auto-trigger conditions
- A new module is built with no tests
- Running `/audit` (testing dimension)
- CI coverage report shows below-threshold coverage
- User asks "what tests do I need for this?"

## Layer
NestJS Service layer (unit) + Controller layer (integration) + BullMQ processors (`apps/workers`) + React
feature layer (component tests).

---

## Test gap analysis process

1. List all service files in `apps/api/src/modules/<name>/`
2. Check for `*.spec.ts` neighbors — what exists vs. what's required
3. List all frontend feature files in `apps/web/src/features/<name>/`
4. Check `__tests__/` for component tests
5. Check `e2e/` for workflow tests
6. Report: current estimated coverage vs. thresholds

---

## Required tests per module

### Backend — service unit tests
For every method on the `@Injectable()` service:
- [ ] Happy path — valid input, returns expected output
- [ ] 404 — resource not found (camera/zone/incident)
- [ ] 403 — actor's `user_access_scopes` does not cover the target zone/site (cross-zone access attempt)
- [ ] 409 — conflict (duplicate `cameraCode`, incident already actioned)
- [ ] 409 — optimistic lock failed (`IncidentStatus` already changed under a concurrent `updateMany`)
- [ ] Where relevant: escalation timer paused on acknowledge, recovery requires 2 consecutive good checks

### Backend — API integration tests
For every route:
- [ ] Unauthenticated → 401
- [ ] Wrong role / out-of-scope zone → 403
- [ ] Valid input → 201/200 with correct `{ success, data }` envelope
- [ ] Invalid input (DTO/`class-validator`) → 400 with field-level errors
- [ ] Not found → 404

### RBAC + ScopeType test matrix (for every critical route)
```
Route: POST /cameras/:id/live/start
SUPER_ADMIN    → 201 ✅ (ScopeType ALL)
PROJECT_ADMIN  → 201 ✅ if the camera's zone/site is in scope, else 403
CLIENT_VIEWER  → 403 ✅ for anything that isn't the read-only dashboard/report surface
```
Every role, and every `ScopeType` boundary (ALL / REGION / ZONE / SITE), must be tested — not just the
happy-path role.

### Frontend — component tests
For every exported page/component:
- [ ] Renders without crashing
- [ ] Loading skeleton shown while `isLoading: true`
- [ ] Error state shown while `isError: true`
- [ ] Happy path: correct data renders (e.g. `IncidentKanban` columns, `HealthScoreRing` value)
- [ ] User interaction: acknowledge/create/move actions work
- [ ] CLIENT_VIEWER role hides admin-only elements (acknowledge, close, RTSP config, camera move)

### E2E — Playwright
For every user-facing workflow:
- [ ] Full happy path from login to completion (e.g. health check → incident → acknowledge → recovery)
- [ ] Unauthenticated redirect to `/login`
- [ ] Role-restricted action returns correct behavior

---

## Coverage thresholds
```
Backend service layer:  ≥ 80%
Utility functions:      ≥ 90%
Frontend components:    ≥ 70%
```

---

## Output format

```
## Test Gap Analysis: [Module Name]

### Missing tests
[TEST-001] IncidentService.acknowledge() — no tests at all
  Required: happy path + wrong-zone 403 + already-acknowledged 409
  Create: apps/api/src/modules/incident/incident.service.spec.ts

[TEST-002] RBAC matrix incomplete for POST /cameras/:id/live/start
  Tested: SUPER_ADMIN only
  Missing: PROJECT_ADMIN (scoped 200/403), CLIENT_VIEWER (should 403)

[TEST-003] IncidentKanban has no component test
  Create: apps/web/src/features/incident/__tests__/IncidentKanban.test.tsx

### Coverage estimate
Backend: ~45% (target 80%) — Gap: 35%
Frontend: ~30% (target 70%) — Gap: 40%

### Priority order
1. Service unit tests — unblock CI coverage gate
2. RBAC/ScopeType matrix tests — security requirement
3. E2E happy path (health probe → incident → recovery) — release confidence
```

## Skills to read
- `.claude/skills/skill-testing-patterns.md`

## Rules enforced
- `rule-testing-standards.md`