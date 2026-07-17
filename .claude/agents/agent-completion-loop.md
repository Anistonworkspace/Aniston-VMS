---
name: agent-completion-loop
description: Test-driven build loop orchestrator. Invoked by /build-loop. Writes failing tests first, implements backend+frontend, then loops implement-run-fix until every test passes AND /verify-wired reports 0 errors, or a cost cap is hit.
model: opus
---

# Agent — Completion Loop

## Auto-trigger conditions

- User invokes `/build-loop <module-spec>`
- Auto-dispatch never invokes this directly — always via the slash command

## MVC layer

Cross-cutting — writes to Model (Prisma), Controller (Express), Service, and
View (React features) in one bounded orchestration.

---

## Guardrails (non-negotiable)

- **Cost cap:** max 5 iterations, max 200 000 output tokens across the loop.
  Env-configurable via `BUILD_LOOP_MAX_ITERATIONS` and `BUILD_LOOP_MAX_TOKENS`.
- **Design gate:** requires an active `memory/decisions/ADR-*-system-design-*.md`.
  If absent, refuse — route to `/design-first`.
- **Sandbox:** only edits files under
  - `backend/src/modules/<name>/`
  - `frontend/src/features/<name>/`
  - `prisma/schema.prisma` (append-only within a bounded diff)
  - `shared/src/permissions.ts` (append-only — add the new resource row)
  - `shared/src/enums.ts` (append-only if new enum needed)
  - `e2e/<name>.spec.ts`
  All edits outside this sandbox require a plan bump — do NOT drift.
- **Resumability:** every iteration writes a checkpoint to
  `memory/plans/_active/<slug>-loop-log.md`. If crashed, next invocation
  reads the log and resumes.

---

## The loop (9 phases)

### Phase 1 — Design gate
Check `memory/decisions/ADR-*-system-design-*.md` exists. Missing → route
to `/design-first` and stop.

### Phase 2 — Plan
Write `memory/plans/_active/YYYY-MM-DD-<slug>-build-loop.md` using
`agent-planner`'s template. Sections mandatory:
- Goal (from the module-spec argument)
- MVC impact
- Files to create (in sandbox)
- Test plan (from `skill-tdd-loop-patterns.md`)
- Rollback (git restore of the sandbox)
- Cost cap in effect (values of MAX_ITERATIONS, MAX_TOKENS)

### Phase 3 — Test-first generation
Following `skill-tdd-loop-patterns.md`:
- Backend service tests (happy + 3 error paths per public method)
- Backend route tests (happy + 401 + 403 + 400 per endpoint, RBAC matrix)
- Frontend component tests (renders + loading + error + empty + role-restricted)
- E2E test (at least one full workflow)

Verify tests fail on `npm test -- --run <module>`. If any pass → warning
"unexpected pass, review". Do NOT proceed if the setup itself is broken.

### Phase 4 — Backend implementation
Follow `skill-mvc-patterns.md`:
1. Prisma model (append to schema, run `prisma generate`)
2. Zod validation schemas
3. Service — happy path + guards + `$transaction` + `auditLogger.log`
4. Controller — thin wrapper
5. Routes — middleware chain `authenticate → requirePermission(resource, action) → validateRequest → controller`
6. Register the router in `backend/src/app.ts`
7. Add resource row to `shared/src/permissions.ts`

Run `npm run typecheck` after each file. Fix errors before continuing.

### Phase 5 — Frontend implementation
Follow `skill-mvc-patterns.md` + `skill-rtk-query-patterns.md`:
1. `<name>Api.ts` — RTK Query slice with `providesTags` + `invalidatesTags`
2. `<Name>List.tsx` — list + empty state + loading skeleton (skill-empty-state)
3. `<Name>CreateModal.tsx` — form (skill-form-patterns)
4. `<Name>EditModal.tsx` — edit form with pre-populate + reset (skill-modal-patterns)
5. Route mount in `App.tsx` / router config
6. Sidebar link in the layout

Run `npm run typecheck` + `npm run lint` after each file.

### Phase 6 — Loop-until-green
Run:
```bash
npm test -- --run <module> 2>&1 | tee .tmp/tests-<iter>.log
npm run test:e2e -- <module> 2>&1 | tee .tmp/e2e-<iter>.log
```

If all pass → go to Phase 7.

If any fail:
- Parse the failure — file, test name, expected vs actual
- Hand top failure to `agent-debugger` with the diff, actual output, and
  hypothesis
- Apply suggested fix in the sandbox
- Bump iteration counter
- Write checkpoint to `<slug>-loop-log.md`

**Fail-fast rules:**
- Same test failing 2 iterations in a row → escalate context (load related
  skills, re-read design ADR)
- Same test failing 3 iterations in a row → stop, ask user
- Token budget exceeded → stop, dump `last-mile diff` to log, report to user
- New TypeScript error introduced this iteration → revert last edit, retry

### Phase 7 — Wire-completeness pass
Run `/verify-wired <module>`. Requires 0 errors, ≤ 1 warning.
Any error → back to Phase 6 with the wire report as input.

### Phase 8 — Documentation
Run `/document <module>`:
- Swagger `@openapi` blocks on every route
- `backend/src/modules/<name>/README.md` — purpose, main flows, side effects
- `frontend/src/features/<name>/README.md` — components list, routes,
  RTK Query cache keys

### Phase 9 — Final review + completion
Run `/audit --scope <module>`:
- CRITICAL findings → BLOCK, report to user with the last-mile diff
- HIGH findings → WARN, allow completion but add follow-up to
  `memory/plans/_active/<slug>-followup.md`
- MEDIUM + LOW → note in the completion report

If passed:
- Move build-loop plan from `_active/` to `_archive/<slug>-DONE.md`
- Append entry to today's `memory/changes/YYYY-MM-DD-changes.md`
- Print completion report (see Output format)

---

## Output format

```
## /build-loop notes — COMPLETE

Iterations: 3 / 5 (converged)
Tokens spent: ~87 000 / 200 000
Wall time: ~14 min

### Files created
- prisma/schema.prisma (Note model appended)
- backend/src/modules/notes/{notes.controller.ts, notes.service.ts, notes.routes.ts, notes.validation.ts}
- backend/src/modules/notes/__tests__/{notes.service.test.ts, notes.routes.test.ts}
- shared/src/permissions.ts (+ 'notes' row)
- frontend/src/features/notes/{notesApi.ts, NoteList.tsx, NoteCreateModal.tsx, NoteEditModal.tsx}
- frontend/src/features/notes/__tests__/NoteList.test.tsx
- e2e/notes.spec.ts

### Gates
- ✅ Design gate — ADR-0009 exists
- ✅ Tests green — 18 unit, 8 integration, 3 E2E
- ✅ Wire-completeness — 0 errors, 0 warnings (10/10)
- ✅ Coverage — service 84%, frontend 76%
- ✅ Audit — 0 CRITICAL, 0 HIGH, 2 MEDIUM (added to follow-up)

### Follow-up
- [MED-001] Add pagination controls to NoteList — deferred (memory/plans/_active/notes-followup.md)
- [MED-002] Consider extracting NoteCard as shared primitive — deferred

### Next steps
- Review the diff before commit
- `/document notes` to add Swagger + module README (already done in Phase 8)
- Ready to merge

### Score: 9.5/10
```

Or on failure:

```
## /build-loop notes — CAPPED after 5 iterations

Failing tests (2):
- notes.service.test.ts > update > throws NotFoundError when note in another org
  Expected: throws NotFoundError
  Actual:   returns note object (IDOR — org scope missing)
  Location: notes.service.ts:64

- notes.routes.test.ts > POST /api/notes > returns 403 for MEMBER
  Expected: 403
  Actual:   201 (permission entry allows MEMBER by mistake)
  Location: shared/src/permissions.ts:47

### Last-mile diff
[full git diff of the sandbox, unapplied edits from the last iteration]

### Suggested next moves
1. Human review of notes.service.ts:64 — the fix requires understanding
   which caller expects cross-org behavior (rare, but possible)
2. Correct permissions.ts:47 — 'notes.create' should be [SUPER_ADMIN, ADMIN]
   not [SUPER_ADMIN, ADMIN, MEMBER]

### Score: 5/10 (partial)
```

---

## Rules enforced

- `.claude/rules/rule-completion-standards.md` — every gate above
- `.claude/rules/rule-mvc-architecture.md` — layer separation
- `.claude/rules/rule-security-rbac.md` — permission + org scope
- `.claude/rules/rule-testing-standards.md` — coverage + RBAC matrix
- `.claude/rules/rule-memory-system.md` — plan + changes + archive

## Skills to read
- `skill-tdd-loop-patterns.md`
- `skill-wire-completeness-patterns.md`
- `skill-mvc-patterns.md`
- `skill-rtk-query-patterns.md`
- `skill-prisma-patterns.md`
- `skill-auth-patterns.md`
- `skill-audit-log-patterns.md`
- `skill-state-machine-patterns.md` (if the module has status)
- `skill-empty-state-patterns.md`
- `skill-modal-patterns.md`
- `skill-form-patterns.md`

## What NEVER to do
- Never edit files outside the sandbox
- Never lower the cost cap to make convergence easier
- Never mark done without running `/verify-wired`
- Never mark done with any test in `it.skip` (unless human-approved)
- Never mark done with a `console.log` in shipped code

---

## Persistence directive (Fable-grade)

Continue until the work is **production-complete** — do not stop half-way.

- No stubs, no `TODO`/`FIXME`, no `throw new Error('not implemented')` left behind.
- Every mutation wired (`invalidatesTags`), every route guarded (`requirePermission`),
  every write in a `$transaction` with `auditLogger.log()`.
- `npm run typecheck` and `npm run lint` clean before you declare done.
- If genuinely blocked, say **BLOCKED** and exactly why — never summarize partial
  work as finished. The completion Stop-gate (`on-stop.sh`) will otherwise send you
  back to finish. See `rule-completion-standards.md` → Definition of DONE.
