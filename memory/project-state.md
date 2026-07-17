---
# Project metadata — updated by /project-init. /start reads these.
project_name: Aniston VMS
project_slug: aniston-vms
description: Multi-tenant CCTV Video Management System (region → zone → site → camera) — live wall via MediaMTX WHEP/HLS, recordings/playback, health monitoring, incidents + escalation, WhatsApp/SES notifications, reports
domain: cctv-video-management
target_platforms:
  - Web SPA (primary — control room)
primary_roles:
  - SUPER_ADMIN
  - PROJECT_ADMIN
  - CLIENT_VIEWER
status: stage-1-foundation-in-progress
started_at: 2026-05-21
---

# Project State

**Last updated:** 2026-07-17 — repo re-purposed from the generic boilerplate to **Aniston VMS**.
Plan docs `docs/01-PRD.md` … `docs/06-implementation-plan.md` + `CLAUDE.md` (master prompt) added;
leftover boilerplate docs rewritten to describe Aniston VMS.

---

## What this repo is

**Aniston VMS** — a multi-tenant CCTV Video Management System built on the AI-agent boilerplate
harness. Product truth: `docs/01-PRD.md`–`docs/06-implementation-plan.md` (TRD/schema v1.0,
17 July 2026, built for plan v1.3). Harness (`.claude/` agents/skills/rules/hooks, memory system,
graphify, pxpipe, doctor) is unchanged and remains the build system.

---

## Current state

### Stage 1 (Foundation) — IN PROGRESS
Per `docs/06-implementation-plan.md` and
[`plans/_active/2026-07-17-stage-1-foundation.md`](plans/_active/2026-07-17-stage-1-foundation.md):

- Prisma schema (28 tables per `docs/05-backend-schema.md`) + shared enums + seed — **underway**
- Frontend design tokens (per `docs/04-uiux-brief.md`) — **underway**
- AppShell + Overview dashboard with mock data — **underway**

### Application code
- Backend: still skeleton (boot + `/api/health`, generic middleware, prisma/redis/logger,
  encryption util). VMS modules land stage by stage.
- Frontend: app shell + design-system primitives; VMS tokens/pages land in Stage 1.
- Prisma: **zero models yet** — Stage 1 delivers the VMS schema.

### AI-agent layer (`.claude/`) — unchanged
- 21 agents, 51 skills, 18 rules, 30 commands, 6 hooks; pxpipe, Graphify, capsule, Setup Doctor
  all active (see `.claude/GUIDE.md`).

### Docs refresh (2026-07-17)
- `README.md`, `docs/README.md`, `docs/reference-index.md`, `docs/architecture.md`,
  `docs/database-erd.md`, `docs/api-conventions.md`, `docs/tech-stack-targets.md`, `memory/*`
  rewritten for Aniston VMS. Plan docs 01–06 + `CLAUDE.md` are authoritative — never edit them
  from doc-refresh tasks.

---

## Known gaps / next work

1. Execute Stage 1 plan (`plans/_active/2026-07-17-stage-1-foundation.md`).
2. Foundation layer for authed features (auth module, permissions matrix, scope guard) — needed
   before Stage 2+ modules compile (skills/rules assume it).
3. Stages 2–10 per `docs/06-implementation-plan.md` (hierarchy CRUD, camera onboarding, live wall,
   playback, health engine, incidents, notifications, reports, hardening).

## How to start

`/start` → read this file + `CLAUDE.md` + `docs/06-implementation-plan.md` → continue the active
Stage 1 plan. New machine: `docs/NEW-MACHINE-SETUP.md` or `npm run setup:ai`.

## Conventions in force
`.claude/rules/rule-*.md` (binding) + [conventions.md](conventions.md) — API envelope, MVC module
pattern, scope-guarded queries (`user_access_scopes`), RTK Query only on frontend, VMS naming
(`CAM-042`, `ANI-CAM-2026-000145`).
