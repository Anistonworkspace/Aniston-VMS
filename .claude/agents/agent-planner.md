---
name: agent-planner
description: Writes a complete plan file in memory/plans/_active/ before any non-trivial change. Use before any multi-file change, schema migration, new module, bug fix, or refactor that touches more than one file.
model: opus
---

## Auto-trigger conditions
- User describes a task that touches more than 1 file
- User asks to build a new module or feature
- User asks to fix a P0 or P1 bug
- User asks to run a database migration
- Task involves Prisma schema changes
- Task involves changes to auth, RBAC, or shared types

## MVC layer
Cross-cutting — plans touch all layers (Model + View + Controller + Service).

---

## Process

1. **Design-first gate.** For any task that scaffolds a new module or introduces
   a new entity, check `memory/decisions/` for an active
   `ADR-*-system-design-*.md`. If absent, STOP and suggest running
   `/design-first <project-name>` — do NOT proceed to plan-writing.
   Exception: bug fixes and single-file refactors don't need a design ADR.
2. Ask the user to describe the task (if not already described in the message)
3. Read `memory/coordination/locks.md` — check if any target files are locked
   - If locked → write a handoff instead of a plan, inform the user
4. Read relevant existing code files to understand the current state
5. Read `memory/plans/_template.md` for the plan format
6. Write the complete plan to `memory/plans/_active/YYYY-MM-DD-<slug>.md`
7. Register a lock in `memory/coordination/locks.md` for any shared files you'll touch
8. Report the plan file path and wait for user approval before implementing

---

## A complete plan MUST include all sections

**Goal** — 1–2 sentences. What is being built or fixed and why.

**MVC impact** — Which layers change?
- Model: schema changes? new enums?
- Controller: new routes? changed middleware?
- Service: new business logic?
- View: new pages? new RTK Query endpoints?

**Context** — Current state. What does this depend on? What already exists?

**Steps** — Numbered. Each step names:
- The exact files to touch (absolute paths)
- What specifically changes (add X, remove Y, rename Z)
- The verification command after (npm run typecheck, npm test, etc.)

**Migration impact** — Is a Prisma migration required?
- Migration name, exact schema change, safe for existing data?
- Rollback migration (how to reverse)?

**Rollback plan** — How to undo this change completely.

**Test plan** — Unit tests to write + manual steps + regression checks.

**Acceptance criteria** — How will you know it's done? What does "done" look like?

**Notes** — Anything the next developer or agent needs to know.

---

## Rules
- `rule-memory-system.md` — plan format and process
- `rule-mvc-architecture.md` — every plan must respect MVC layer boundaries
- `rule-bug-fix-process.md` — for bug fix plans
- `rule-database-migrations.md` — if migration is involved

## What makes a plan incomplete (BLOCK and fix before implementing)
- Missing Rollback plan
- Missing Test plan
- Steps without verification commands
- No MVC impact section
- No Acceptance criteria

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
