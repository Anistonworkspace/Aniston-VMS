---
# Completion Standards — Binding for every scaffolded module

A module is NOT "done" until it survives BOTH gates below. Half-built
features (controller works but UI doesn't invalidate; mutation succeeds but
audit trail is silent) are the biggest bug source in projects like this
one.

---

## Definition of DONE (hard gate — never declare done otherwise)

**NEVER** report work as done, finished, or complete while ANY of these is true.
This is enforced by the completion Stop-gate (`.claude/hooks/on-stop.sh`), which
blocks stopping until it's clean:

- A `TODO`, `FIXME`, `XXX`, `// stub`, or `// placeholder` remains in the diff.
- A `throw new Error('not implemented')` or equivalent stub remains.
- `console.log/error/warn` was added in `backend/` (use the logger).
- `npm run typecheck` is not clean.
- `npm run lint` is not clean.
- A mutation lacks `invalidatesTags`, a route lacks `requirePermission`, or a
  write-service method lacks `$transaction` + `auditLogger.log()`.
- `/verify-wired <module>` reports any error.

**Production-complete, or explicitly BLOCKED — never "mostly done".** If you are
genuinely blocked (missing input, a decision only the user can make, an external
dependency), say **BLOCKED** and exactly why, then run `/stop-anyway` to pause.
Do not silently stop with unfinished code.

---

## Gate 1 — Tests pass

- Backend service: happy + main error path per method (rule-testing-standards.md)
- Backend routes: happy + 401 + 403 + 400 per endpoint (RBAC matrix)
- Frontend components: renders + loading + error + empty + role-restricted UI
- E2E: at least one full workflow from login to result

Coverage thresholds from `rule-testing-standards.md`:
- Backend service ≥ 80 %
- Utilities ≥ 90 %
- Frontend components ≥ 70 %

The `/build-loop` command runs tests iteratively until they pass or a cost
cap is hit. **Cost cap defaults:** 5 iterations, 200 000 output tokens.
Configurable via `BUILD_LOOP_MAX_ITERATIONS` and `BUILD_LOOP_MAX_TOKENS`.

---

## Gate 2 — Wire-completeness verified

The 12-hop trace from `skill-wire-completeness-patterns.md` MUST pass with:

- **0 errors** — every hop present
- **≤ 1 warning** — one warning is acceptable if it's for a valid reason
  (e.g. explicitly async socket emit); more than one means the module
  is not ready

Run `/verify-wired <module>` to check. Score ≥ 9/10 required.

---

## Gate 3 — Documentation minimum

- Every public service method has a JSDoc block naming its `throws`
- Every route has a `@openapi` comment for Swagger
- Module has a `README.md` with: purpose (1 sentence), main flows (bullets),
  side effects (audit + socket + BullMQ)
- Any new permission added to `shared/src/permissions.ts` is in the RBAC
  test matrix

---

## When a module is DONE (checklist)

- [ ] Tests pass on `npm test -- <module>` (green)
- [ ] E2E passes on `npm run test:e2e -- <module>` (green)
- [ ] `/verify-wired <module>` reports score ≥ 9/10, 0 errors
- [ ] Coverage above threshold in `vitest.config.ts`
- [ ] Swagger docs updated (`/api/docs` shows the new routes)
- [ ] Module README exists
- [ ] Permission entry present in `shared/src/permissions.ts` if new
      resource
- [ ] Enum sync verified (`shared/src/enums.ts` matches `prisma/schema.prisma`)
- [ ] No `console.log` (ESLint enforces)
- [ ] `npm run typecheck` clean
- [ ] `npm run lint` clean
- [ ] Plan file moved to `memory/plans/_archive/` with `-DONE` suffix
- [ ] Entry in `memory/changes/YYYY-MM-DD-changes.md`

## When a module is NOT done (block signals)

- Any test fails
- `/verify-wired` reports ≥ 1 error
- Swagger docs are stale (route exists in code but not in `/api/docs`)
- Coverage below threshold
- TypeScript error anywhere in the module
- ESLint error anywhere in the module
- Plan file still in `_active/`

`/build-loop` will not mark a module done until all above pass.
`agent-code-review` will BLOCK on merge if any above fails.

---

## Do-not

- **Do NOT declare a module done because it works in your dev browser.** The
  gates above catch what "works in dev" misses.
- **Do NOT skip Gate 2 (wire-completeness) because "the mutation works".** A
  mutation that succeeds but doesn't invalidate the cache produces a stale
  UI that eventually confuses a user.
- **Do NOT lower cost caps to make the loop pass faster.** A loop that
  finishes without converging isn't a passing loop.
- **Do NOT run `/build-loop` against a module with no design ADR.** Design
  gate blocks — run `/design-first` first.
