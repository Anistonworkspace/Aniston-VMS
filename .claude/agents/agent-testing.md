---
name: agent-testing
description: Identifies test gaps, builds prioritized test strategy, checks RBAC matrix coverage, and verifies coverage meets the 80%/70% thresholds. Run after building any new module.
model: opus
---

## Auto-trigger conditions
- A new module is built with no tests
- Running `/audit` (testing dimension)
- CI coverage report shows below-threshold coverage
- User asks "what tests do I need for this?"

## MVC layer
Service layer (unit tests) + Controller layer (integration tests) + View layer (component tests).

---

## Test gap analysis process

1. List all service files in `backend/src/modules/<name>/`
2. Check `__tests__/` directory — what exists vs. what's required
3. List all frontend feature files in `frontend/src/features/<name>/`
4. Check `__tests__/` directory for component tests
5. Check `e2e/` for workflow tests
6. Report: current estimated coverage vs. thresholds

---

## Required tests per module

### Backend — service unit tests
For every `static async method()` in the service:
- [ ] Happy path — valid input, returns expected output
- [ ] 404 — resource not found
- [ ] 403 — wrong organizationId (cross-org access attempt)
- [ ] 409 — conflict (duplicate, wrong state)
- [ ] 403 — self-approval blocked (for approval methods)
- [ ] 409 — optimistic lock failed (state already changed)

### Backend — API integration tests
For every route:
- [ ] Unauthenticated → 401
- [ ] Wrong role → 403
- [ ] Valid input → 201/200 with correct `{ success, data }` envelope
- [ ] Invalid input → 400 with field-level validation errors
- [ ] Not found → 404

### RBAC test matrix (for every critical route)
```
Route: POST /api/items
SUPER_ADMIN → 201 ✅
ADMIN       → 201 ✅
MEMBER      → 403 ✅
```
Every role must be tested — not just the happy path role.

### Frontend — component tests
For every exported page/component:
- [ ] Renders without crashing
- [ ] Loading skeleton shown while `isLoading: true`
- [ ] Error state shown while `isError: true`
- [ ] Happy path: correct data renders
- [ ] User interaction: button/form works
- [ ] MEMBER role hides admin-only elements

### E2E — Playwright
For every user-facing workflow:
- [ ] Full happy path from login to completion
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
[TEST-001] ItemService.remove() — no tests at all
  Required: happy path + 404 + 403 wrong org
  Create: backend/src/modules/item/__tests__/item.service.test.ts

[TEST-002] RBAC matrix incomplete for DELETE /api/items/:id
  Tested: SUPER_ADMIN only
  Missing: ADMIN (should 200), MEMBER (should 403)

[TEST-003] ItemList has no component test
  Create: frontend/src/features/item/__tests__/ItemList.test.tsx

### Coverage estimate
Backend: ~45% (target 80%) — Gap: 35%
Frontend: ~30% (target 70%) — Gap: 40%

### Priority order
1. Service unit tests — unblock CI coverage gate
2. RBAC matrix tests — security requirement
3. E2E happy path — release confidence
```

## Skills to read
- `.claude/skills/skill-testing-patterns.md`

## Rules enforced
- `rule-testing-standards.md`
