# Plan: Stage 1 — Foundation (Aniston VMS)

**Created:** 2026-07-17
**Owner agent:** agent-planner
**Status:** active
**Linked to:** [project-state.md](../../project-state.md), `docs/06-implementation-plan.md` (Stage 1), `CLAUDE.md`

## Goal

Deliver the Stage 1 Foundation per `docs/06-implementation-plan.md`: the full VMS Prisma schema +
shared enums + seed data, and the frontend foundation (design tokens + AppShell + Overview
dashboard with mock data). "Done" = migrations + seed run clean, typecheck/build green, app shell
renders the Overview dashboard with mock data.

## Context

- Repo re-purposed from the generic boilerplate; `prisma/schema.prisma` currently has **zero models**.
- Schema source of truth: `docs/05-backend-schema.md` (28 tables, PostgreSQL 16, snake_case,
  uuid pks, UTC timestamps; enums listed in § Enums).
- UI direction: `docs/04-uiux-brief.md` + `docs/design-reference.jpeg`; screen map: `docs/03-app-flow.md`.
- Frontend skeleton already has an app shell + design-system primitives to build on.

## Steps

- [ ] Step 1 — Prisma schema: all 28 tables + enums from `docs/05-backend-schema.md`
  - Files touched: `prisma/schema.prisma`, `prisma/migrations/**`
  - Verification: `npm run db:migrate` creates a clean migration; `npx prisma validate`
- [ ] Step 2 — Shared enums mirroring Prisma (Role, ScopeType, CameraStatus, CheckType, Diagnosis,
  IncidentStatus, Severity, Channel, NotificationStatus, StreamKind, PlaybackAdapter, ClipStatus,
  TaskType, TaskSource, TaskStatus, LayoutKind)
  - Files touched: `shared/src/enums.ts` (+ `shared/src/index.ts` exports)
  - Verification: `npm run typecheck` (values identical to schema — spot-check against docs/05)
- [ ] Step 3 — Seed per `docs/05-backend-schema.md § Retention & jobs`: 4 regions, 13 zones
  (Delhi structure), 2 demo sites, 2 routers, 6 simulator cameras (`playback_adapter=ONVIF_G`),
  default alert rules matrix, default escalation policy, one admin user
  - Files touched: `prisma/seed.ts`
  - Verification: `npm run db:seed` idempotent; row counts match
- [ ] Step 4 — Design tokens from `docs/04-uiux-brief.md` / `design-reference.jpeg`
  - Files touched: `frontend/tailwind.config.*`, frontend design-token/theme files
  - Verification: `npm run build --workspace=frontend`; tokens visible in a sample page
- [ ] Step 5 — AppShell: nav per `docs/03-app-flow.md` (Overview, Live Wall, Cameras, Incidents,
  Reports, Admin), VMS branding
  - Files touched: frontend app-shell/layout components + router
  - Verification: shell renders, routes stubbed, no console errors
- [ ] Step 6 — Overview dashboard with **mock data** (health/status tiles per docs/03; no API wiring yet)
  - Files touched: `frontend/src/features/overview/**` (page + mock fixtures)
  - Verification: dashboard renders mock KPIs; `npm run typecheck` clean

## Migration / data impact

Yes — first real migration (empty → 28 tables) + seed. Dev-only DB; rollback = reset. Backup not
required (no production data exists).

## Rollback plan

- `npx prisma migrate reset` (dev) or drop the generated migration folder before commit.
- Revert commits touching `prisma/`, `shared/src/`, `frontend/` (`git revert` — no force-push).

## Test plan

- Unit tests to add/update: seed helpers, enum parity check (shared vs Prisma).
- Integration tests to add/update: none yet (no API endpoints in Stage 1).
- Manual smoke check: `docker compose up` → migrate + seed → `npm run dev` → Overview dashboard
  shows mock data; `/doctor` green.

## Acceptance criteria

- [ ] All steps executed
- [ ] `npm run typecheck` + `npm run build --workspace=frontend` + migrate/seed pass
- [ ] No regressions in: backend boot (`/api/health`), harness hooks/doctor
- [ ] Updated [project-state.md](../../project-state.md)
- [ ] Logged in today's [changes](../../changes/) file
- [ ] Moved this file to `plans/_archive/` with completion date appended to filename

## Notes / handoff

Scope guard/auth module is **not** Stage 1 (schema + shell only) — flag it as the first Stage 2
prerequisite. Keep enums SCREAMING_SNAKE and identical in both places; quote `docs/05-backend-schema.md`
rather than inventing fields.
