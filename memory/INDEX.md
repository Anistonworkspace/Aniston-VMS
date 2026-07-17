# Memory Index

**Always read this file first when starting work on this project.**

## Quick orientation

- Project: **Aniston VMS** — multi-tenant CCTV Video Management System (region → zone → site → camera)
- Owner: Aniston Technologies LLP
- Stack: React 18 + Vite + Tailwind + RTK Query · Express + Prisma + PostgreSQL 16 + Redis + BullMQ + Socket.io · MediaMTX (WHEP/HLS) · FFprobe workers · Python OpenCV analysis · WhatsApp Cloud API + AWS SES
- Master prompt: `/CLAUDE.md` · Plan docs: `/docs/01-PRD.md` … `/docs/06-implementation-plan.md` (authoritative)
- Project conventions: see [conventions.md](conventions.md) and `.claude/rules/`
- Current state: see [project-state.md](project-state.md) — **Stage 1 (Foundation) in progress**
- Recent sessions: see [sessions/](sessions/) | Compaction recoveries: [sessions/compact/](sessions/compact/)

## Start-of-work checklist

When an agent (or fresh chat) begins, do these in order:

1. Read [project-state.md](project-state.md) → know what's built, what's pending, what's broken.
2. Read [coordination/locks.md](coordination/locks.md) → know which files other agents are editing right now.
3. Read [coordination/shared-context.md](coordination/shared-context.md) → pick up cross-agent learnings.
4. Read [coordination/handoffs.md](coordination/handoffs.md) → check if another agent left a task for you.
5. Scan [plans/_active/](plans/_active/) → see if there's an in-flight plan you should continue.
6. Skim recent [changes/](changes/) entries (last 2-3 days) → understand recent code shifts.
7. Read relevant [decisions/](decisions/) ADRs for the area you'll touch.
8. Check [sessions/compact/](sessions/compact/) for the latest compaction save — if one exists from today, read it to recover mid-session context.

Only then start the user's task.

## End-of-work checklist

When wrapping up a task:

1. Update [project-state.md](project-state.md) with what changed.
2. Append today's changes to `changes/YYYY-MM-DD-changes.md`.
3. Release any file locks you held in [coordination/locks.md](coordination/locks.md).
4. If you learned something the next agent should know → write to [coordination/shared-context.md](coordination/shared-context.md).
5. If you started but didn't finish → write a handoff in [coordination/handoffs.md](coordination/handoffs.md) and leave the plan in `plans/_active/`.
6. Move any completed plan from `plans/_active/` to `plans/_archive/`.

## Map of important files

| What | Where |
|---|---|
| Project instructions for AI (master prompt) | `/CLAUDE.md`, `/AGENTS.md` |
| Product plan docs (PRD/TRD/flow/UIUX/schema/stages) | `/docs/01-PRD.md` … `/docs/06-implementation-plan.md`, `/docs/design-reference.jpeg` |
| Working docs (architecture/ERD/API/stack) | `/docs/architecture.md`, `/docs/database-erd.md`, `/docs/api-conventions.md`, `/docs/tech-stack-targets.md` |
| Code conventions (binding rules) | `/.claude/rules/*.md` |
| Available agents | `/.claude/agents/*.md` |
| Quick slash-commands | `/.claude/commands/*.md` |
| Tech stack & architecture decisions | [decisions/](decisions/) |
| Session logs (auto-written by /done) | [sessions/](sessions/) |
| Context compaction saves | [sessions/compact/](sessions/compact/) |
| Glossary of VMS terms | [glossary.md](glossary.md) |
| Prisma schema | `/prisma/schema.prisma` (empty until Stage 1 lands — target: `/docs/05-backend-schema.md`) |
| RBAC permissions matrix | `/shared/src/permissions.ts` (scaffolded with the auth foundation) |

## Active counts (update when changed)

- Backend modules: 0 (skeleton — VMS modules land per stage)
- Frontend features: 0 (app shell + design system only)
- Prisma models: 0 — Stage 1 delivers the VMS schema (28 tables per `docs/05-backend-schema.md`)
- ADRs recorded: 8 (ADR-0001 through ADR-0008 — ADR-0002 superseded by ADR-0008)
- Skills: 51 · Rules: 18 · Agents: 21 · Commands: 30 (see `.claude/GUIDE.md`)
- Open plans in `_active/`: 2 — [2026-07-17-stage-1-foundation.md](plans/_active/2026-07-17-stage-1-foundation.md), 2026-07-09-guide-and-reusability-plan.md
- Active file locks: 0
