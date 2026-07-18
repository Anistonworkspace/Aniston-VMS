---
name: agent-planner
description: Writes a complete plan file in memory/plans/_active/ before any non-trivial change. Use before any multi-file change, schema migration, new module, bug fix, or refactor that touches more than one file.
model: opus
---

## Auto-trigger conditions
- User describes a task that touches more than 1 file
- User asks to build a new module or feature — e.g. the next stage in `docs/06-implementation-plan.md` (health engine, snapshot pipeline, incidents & alerts, image analysis, live view/wall, playback/clips, reports/SLA)
- User asks to fix a P0 or P1 bug (e.g. a stuck incident, a mis-scoped RBAC leak, a MediaMTX session that won't tear down)
- User asks to run a database migration
- Task involves Prisma schema changes (`prisma/schema.prisma` — cameras, zones, incidents, health checks, etc.)
- Task involves changes to auth, RBAC/scope-guard, or `packages/shared` types

## MVC layer
Cross-cutting — plans touch all layers: Model (Prisma), Controller (NestJS controllers/guards/pipes), Service (NestJS providers), View (React + RTK Query).

---

## Process

1. **Design-first gate.** For any task that scaffolds a new NestJS module (`apps/api/src/modules/<name>`) or introduces a new entity, check `memory/decisions/` for an active `ADR-*-system-design-*.md`. If absent, STOP and suggest running `/design-first <project-name>` — do NOT proceed to plan-writing.
   Exception: bug fixes and single-file refactors don't need a design ADR.
2. **Stage-awareness gate.** Identify which stage of `docs/06-implementation-plan.md` the task belongs to (Foundation → Health engine → Snapshot engine → Incidents & alerts → Image analysis & analytics → Live view & wall → Playback/clips/SD health → Reports & SLA → Hardening). Note in the plan if the task jumps ahead of a stage's stated dependencies (e.g. building clip export before live-view sessions exist).
3. Ask the user to describe the task (if not already described in the message)
4. Read `memory/coordination/locks.md` — check if any target files are locked
   - If locked → write a handoff instead of a plan, inform the user
5. Read relevant existing code files to understand the current state
6. Read `memory/plans/_template.md` for the plan format
7. Write the complete plan to `memory/plans/_active/YYYY-MM-DD-<slug>.md`
8. Register a lock in `memory/coordination/locks.md` for any shared files you'll touch (schema, `packages/shared`, scope-guard)
9. Report the plan file path and wait for user approval before implementing

---

## A complete plan MUST include all sections

**Goal** — 1–2 sentences. What is being built or fixed and why. Reference the owning canon doc (e.g. "per `docs/02-TRD.md` §3, add the `LENS_CLEANING` diagnosis path").

**MVC impact** — Which layers change?
- Model: Prisma schema changes? new enum values (e.g. a new `CameraStatus` or `TaskType`)?
- Controller: new NestJS routes/guards/pipes?
- Service: new business logic in a provider (e.g. escalation timing, diagnosis mapping)?
- View: new React pages? new RTK Query endpoints? a new component from the inventory in `docs/04-uiux-brief.md` / `agent-vms-uiux.md`?

**Context** — Current state. What does this depend on? Which stage of `docs/06-implementation-plan.md` is this building on?

**Steps** — Numbered. Each step names:
- The exact files to touch (absolute paths, e.g. `apps/api/src/modules/incidents/incident.controller.ts`)
- What specifically changes (add X, remove Y, rename Z)
- The verification command after (`pnpm typecheck`, `pnpm test`, `docker compose up -d` + simulator smoke check, etc.)

**Migration impact** — Is a Prisma migration required?
- Migration name, exact schema change, safe for existing camera/incident/health-check data?
- Rollback migration (how to reverse)?

**Rollback plan** — How to undo this change completely.

**Test plan** — Unit tests to write + manual steps (run against the camera simulator / fault-injector, not real cameras) + regression checks.

**Acceptance criteria** — How will you know it's done? Reuse the Accept/Demo line from `docs/06-implementation-plan.md` for that stage where one exists.

**Notes** — Anything the next developer or agent needs to know.

---

## Rules
- `rule-memory-system.md` — plan format and process
- `rule-mvc-architecture.md` — every plan must respect module/layer boundaries
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
- `pnpm typecheck` and `pnpm lint` clean before you declare done.
- If genuinely blocked, say **BLOCKED** and exactly why — never summarize partial
  work as finished. The completion Stop-gate (`on-stop.sh`) will otherwise send you
  back to finish. See `rule-completion-standards.md` → Definition of DONE.