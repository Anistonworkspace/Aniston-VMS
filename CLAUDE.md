# CLAUDE.md — Aniston VMS

Aniston VMS (Aniston Video Management System) — a production CCTV monitoring platform for ~125 cameras across Delhi zones (plan v1.4). Core domains: 5-stage camera health monitoring, hourly snapshots + image analysis, incident management with escalation ladder, email/WhatsApp alerts with Acknowledge, live view + camera wall, SD-card playback + clip export, reports/SLA, and a camera simulator for development.

> **Plan of record:** the six planning docs in `docs/` (01–03, 05–06 at v1.0; 04 at v2.0). The original master prompt is archived at `docs/claude-code-master-prompt.md` — on conflict, the master prompt wins. UI reference: `docs/actual-design.png`.

## Repository layout (npm workspaces monorepo)

| Path | What it is |
|---|---|
| `frontend/` | `@aniston-vms/frontend` — React 18 + Vite + TypeScript + Tailwind, PWA (vite-plugin-pwa), TanStack Query, feature folders under `src/features/` |
| `backend/` | `@aniston-vms/backend` — current scaffold (migrating to NestJS): Express + TypeScript (ESM), Prisma, BullMQ + ioredis, Socket.IO, zod validation, winston logging, swagger docs |
| `shared/` | `@aniston-vms/shared` — shared TS types/enums/permissions (consumed from source, no build required) |
| `prisma/` | Single schema of record: `prisma/schema.prisma`, migrations, `seed.ts` |
| `docker/` | `docker-compose.dev.yml` (postgres+redis only) and `docker-compose.fullstack.yml` (all 4 services) |
| `e2e/` | Playwright tests |
| `docs/` | Planning docs 01–06, architecture/API conventions, `PROGRESS.md`, `ASSUMPTIONS.md`, `CHANGELOG.md` |
| `.claude/` | Hooks (command guard, doctor), rules, skills, agents |
| `memory/` | Session/project state — update via `/done` after commits |

**Stack source of truth (decided):** the plan docs are canonical — the target architecture is **NestJS (`apps/api`) + pnpm multi-service** (`apps/workers` BullMQ, `services/media` MediaMTX, `services/image-analysis` FastAPI+OpenCV, `packages/shared`), per `docs/02-TRD.md` + `docs/06-implementation-plan.md` + `docs/tech-stack-targets.md`. ⚠️ The current on-disk `backend/` is an **Express + Prisma + BullMQ scaffold being migrated to NestJS** — treat it as legacy to be ported, and align all new backend work (and the agents/skills/rules) to the NestJS target, not the Express scaffold.

## Commands

```bash
npm run dev              # backend (:4000) + frontend (:5173) concurrently
npm run dev:backend      # backend only (needs postgres+redis: npm run docker:dev)
npm run build            # build all workspaces
npm run typecheck        # tsc --noEmit across workspaces
npm run lint / lint:fix  # eslint
npm run test             # vitest across workspaces
npm run test:e2e         # playwright

npm run db:generate      # prisma generate (run after every schema change)
npm run db:migrate       # prisma migrate dev
npm run db:seed          # tsx prisma/seed.ts
npm run db:studio        # prisma studio

npm run docker:dev       # postgres + redis containers only (daily dev)
npm run docker:full      # full stack build+up (CI/staging-like)
```

## Environment

- Copy `.env.example` → `.env` (root). Backend validates env at boot; required: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`/`JWT_REFRESH_SECRET` (min 32 chars), `ENCRYPTION_KEY` (exactly 64 hex chars, AES-256-GCM for RTSP credentials).
- Dev database: `postgresql://postgres:devpassword123@localhost:5432/aniston_vms` (matches compose defaults).
- **Never write `.env` via bash redirects** — the pre-command hook blocks it; use the editor/Write tool.
- Never commit real credentials, tokens, IPs, or phone numbers; use `.env.example` placeholders.

## Naming conventions (post-rename)

- npm scope: `@aniston-vms/*`; root package `aniston-vms`.
- Database: `aniston_vms` (CI: `aniston_vms_test`). Docker containers: `aniston_vms_postgres|redis|backend|frontend`.
- App identity: "Aniston VMS" (PWA name, Capacitor `com.aniston.vms`).

## Build workflow (from the implementation plan)

- Work through **Stages 1–9** in `docs/06-implementation-plan.md`, one stage at a time, with approval gates between stages.
- After each stage: run `npm run typecheck && npm run lint && npm run test`, then update `docs/PROGRESS.md` (what was done + how to demo).
- Missing info → pick a sensible default, mark `TODO(confirm)`, log it in `docs/ASSUMPTIONS.md`.
- Every user-requested change bumps the plan/doc version (minor = additions, patch = fixes) with a line in `docs/CHANGELOG.md`.
- Schema and `docker-compose` files have a single owner per stage — don't edit them from parallel tracks.

## Domain rules that must not drift

- All timestamps stored **UTC**, displayed **IST (Asia/Kolkata)**.
- RTSP credentials are encrypted at rest (AES-256-GCM via `ENCRYPTION_KEY`) — never store or log them in plaintext.
- Zone-scoped RBAC: every camera/incident/alert query is filtered by the user's zone scope — no unscoped list endpoints.
- Health monitoring is staged (1–5); incidents follow Open → Acknowledged → Assigned → In-Progress → Awaiting-Site-Visit → Resolved → Closed.
- Everything must run locally with the camera simulator — no real cameras required.

## UI design system (v1.4 "soft SaaS", see `docs/actual-design.png` + `docs/04-uiux-brief.md`)

- Light theme: slate sidebar with zone dots, cream canvas (`#F6F5F1`), white rounded cards, sage/indigo/coral/sand accent palette, Poppins (display) + Inter (body).
- **Layout:** the app fills the entire viewport — no outer frame/floating card (the dark border in some mockup exports is not part of the UI). The slate sidebar is fixed full-height with its own scroll; only the main column scrolls.
- `PlayerShell` (video chrome) stays charcoal/dark inside the light UI.
- Tailwind tokens live in `frontend/tailwind.config.js`; don't hardcode hex values in components.

## Guardrails (enforced by `.claude/hooks/pre-command.sh`)

- No `prisma db push` against production-shaped URLs (use `prisma migrate deploy`).
- No `rm -rf` of `prisma/`, `*/src/`, `.claude/`, `memory/`.
- No force-push to `main`/`master`; no piping remote scripts to shell.
- After schema changes run `npm run db:generate`; after commits run `/done` to update `memory/project-state.md`.
