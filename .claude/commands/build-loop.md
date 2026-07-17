---
name: build-loop
description: Scaffold a complete feature module with tests written FIRST, then implement, then loop until every test passes AND /verify-wired reports 0 errors. Cost-capped. Guaranteed either fully-wired or clean stop with last-mile diff.
---

# /build-loop — Test-driven, loop-until-complete feature scaffolder

## Precondition — setup gate (MANDATORY, run FIRST)

```bash
bash .claude/hooks/doctor.sh --quiet
```
If this exits non-zero, **STOP — do not scaffold anything.** Run `/doctor --fix`, then give the
user any remaining ⛔ steps + the specific issue. Only proceed once the doctor exits 0. (Hard gate —
the AI toolchain must be set up so the build is correct and token-cheap.)

---

Runs `agent-completion-loop` (see [.claude/agents/agent-completion-loop.md](../agents/agent-completion-loop.md))
through 9 phases: design gate → plan → test-first → backend → frontend →
loop-until-green → wire-completeness → documentation → final review.

**Guardrails:** 5 iterations max, 200 000 output tokens max (both env-configurable).
Requires a system-design ADR to exist (`/design-first` first if not).

Skills read: `skill-tdd-loop-patterns.md`, `skill-wire-completeness-patterns.md`,
`skill-mvc-patterns.md`, `skill-rtk-query-patterns.md`, `skill-prisma-patterns.md`,
`skill-auth-patterns.md`, `skill-audit-log-patterns.md`,
`skill-empty-state-patterns.md`, `skill-modal-patterns.md`, `skill-form-patterns.md`.

---

## Usage

```
/build-loop <module-name> "<module-spec>"
```

Examples:

- `/build-loop notes "user can create, edit, tag, and search notes"`
- `/build-loop bookings "customer books a service, provider accepts, both notified"`
- `/build-loop invoices "admin creates invoice, customer views, marks paid"`

---

## Prerequisites

1. **Design gate:** at least one `memory/decisions/ADR-*-system-design-*.md`
   exists. If not — run `/design-first <ProjectName>` first.
2. **Repo clean-ish:** no unrelated uncommitted changes (the loop stashes them
   with `git stash -u` before starting; restores at the end).
3. **Tests infrastructure:** `npm test` and `npm run test:e2e` work today.

---

## Compared to /new-module

| Feature | `/new-module` | `/build-loop` |
|---|---|---|
| Writes files | ✓ | ✓ |
| Writes tests first | — | ✓ |
| Runs tests | — | ✓ |
| Loops until green | — | ✓ |
| Wire-completeness check | — | ✓ |
| Cost cap | n/a | 5 iter / 200k tokens |
| Suitable for | quick prototype | production feature |

Use `/new-module` for exploratory scaffolds you'll immediately edit.
Use `/build-loop` when you want the feature *actually done* in one command.

---

## Env-configurable guardrails

```powershell
$env:BUILD_LOOP_MAX_ITERATIONS = "10"        # default 5
$env:BUILD_LOOP_MAX_TOKENS     = "500000"    # default 200 000
$env:BUILD_LOOP_SKIP_E2E       = "1"         # skip Playwright (unit + integration only)
```

Only raise these when you understand the trade-off — larger caps → more
cost per invocation.

---

## Output

On convergence:

```
## /build-loop notes — COMPLETE

Iterations: 3 / 5
Tokens: ~87 000 / 200 000
Wall time: ~14 min

Files created: prisma model, service + tests, controller, routes, api slice,
  4 React components, e2e spec, README

Gates: ✅ design ✅ tests (29 green) ✅ wire (10/10) ✅ coverage (backend 84%,
  frontend 76%) ✅ audit (0 CRITICAL, 0 HIGH)

Follow-up: 2 MEDIUM findings queued in memory/plans/_active/notes-followup.md.

Next: review the diff, then commit.
```

On cap-hit (partial):

```
## /build-loop notes — CAPPED after 5 iterations

Failing tests (2 remaining):
  - notes.service.test.ts > update > throws NotFoundError when in another org
  - notes.routes.test.ts > POST /api/notes > returns 403 for MEMBER

Last-mile diff written to memory/plans/_active/notes-loop-log.md.

Suggested next moves:
  1. Human review of notes.service.ts:64
  2. Correct permissions.ts:47

Re-run `/build-loop notes` after fixing to resume from checkpoint.
```

---

## When to use

- Any new feature that will ship to production
- Rebuilding a feature that was previously "done but flaky"
- Freshers building their first module — the loop teaches the wire pattern
  by enforcing it

## When NOT to use

- Editing a single file — use direct editing
- Bug fixes — use `/fix-critical`
- Prototypes you'll throw away — use `/new-module`
- Design decisions still unclear — use `/design-first` first

---

## Rules enforced

- `.claude/rules/rule-completion-standards.md` — all three gates must pass
- `.claude/rules/rule-mvc-architecture.md` — layer separation
- `.claude/rules/rule-security-rbac.md` — permissions + org scope
- `.claude/rules/rule-testing-standards.md` — coverage + RBAC matrix
- `.claude/rules/rule-memory-system.md` — plan + changes + archive
