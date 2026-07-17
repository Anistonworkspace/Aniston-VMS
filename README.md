# Aniston VMS

**Multi-tenant CCTV Video Management System** by Aniston Technologies LLP — region → zone → site
→ camera hierarchy, live viewing over MediaMTX (WHEP/HLS), SD-card recordings & playback,
automated camera health monitoring, incident management with kanban + escalation, WhatsApp/SES
notifications, and reports.

> The authoritative product docs live in [`docs/`](docs/) (`01-PRD.md` … `06-implementation-plan.md`).
> The AI build harness master prompt is [`CLAUDE.md`](CLAUDE.md). Read those first.

---

## What it does

- **Live wall** — grid layouts of live camera streams. `POST /cameras/:id/live/start` issues a
  short-lived stream JWT; the client plays WHEP (`/{path}/whep`) or HLS (`/{path}/index.m3u8`)
  from MediaMTX, which validates each connection via our `POST /internal/media-auth` webhook.
- **Recordings & playback** — SD-card segment discovery (`recording_segments`), timeline playback
  via per-brand playback adapters (ONVIF Profile G first), clip export (`clip_exports`).
- **Health monitoring** — scheduled probes (`RTSP_AUTH`, `RTSP_PORT`, `ROUTER_TCP`,
  `IMAGE_ANALYSIS`, `VIDEO_VALIDATION`), snapshot scoring, hourly connection-quality rollups,
  per-camera health score + diagnosis (e.g. `SITE_INTERNET_DOWN`, `SIM_SIGNAL_ISSUE`, `CAMERA_OFFLINE`).
- **Incidents** — auto-created from alert rules, kanban lifecycle
  (`DETECTED → CONFIRMED → ALERTED → ACKNOWLEDGED → ASSIGNED → INVESTIGATING → …`),
  escalation policies with timed steps, full event timeline.
- **Notifications** — WhatsApp Cloud API + AWS SES, per-zone recipients, delivery tracking
  (`QUEUED → SENT → DELIVERED / READ / FAILED`).
- **Reports** — uptime/health/incident reporting per region/zone/site.

Fleet context: SIM-router-connected cameras with public static IPs (~125 cameras at launch).
See `docs/01-PRD.md` / `docs/02-TRD.md`.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind, Redux Toolkit + **RTK Query**, Framer Motion |
| Backend | Node.js 20+ / **Express** (TypeScript, MVC modules), **Prisma** ORM |
| Data | **PostgreSQL 16**, Redis 7 (cache + BullMQ queues), S3-compatible object storage (snapshots/clips) |
| Media | **MediaMTX** (on-demand RTSP pull → WebRTC/WHEP + HLS), FFmpeg/FFprobe probe workers |
| Analysis | Python OpenCV image-analysis service (brightness/blur/freeze/obstruction/scene-shift) |
| Notify | WhatsApp Cloud API, AWS SES |

Details and versions: [`docs/tech-stack-targets.md`](docs/tech-stack-targets.md).

## Monorepo layout

```
CLAUDE.md            Master prompt for AI agents (read first)
docs/                Product docs: 01-PRD … 06-implementation-plan, design-reference.jpeg,
                     architecture, ERD, API conventions, tech stack
prisma/              schema.prisma + migrations + seed (VMS schema lands in Stage 1)
shared/              Shared TypeScript types/enums (mirror of Prisma enums)
backend/             Express API — modules/, middleware, jobs (BullMQ workers)
frontend/            React SPA — features/, design system, app shell
docker/              Local dev compose (Postgres, Redis, MediaMTX, …)
memory/              AI agent memory: project state, plans, decisions, sessions
.claude/             Agent harness: agents, skills, rules, commands, hooks (see .claude/GUIDE.md)
```

## Run it

See [`GETTING_STARTED.md`](GETTING_STARTED.md) for the full walkthrough. Short version:

```bash
npm install
docker compose -f docker/docker-compose.yml up -d   # Postgres, Redis, (MediaMTX)
npm run db:migrate
npm run dev          # backend :4000, frontend :5173
```

Health: `http://localhost:4000/api/health` · API docs: `http://localhost:4000/api/docs`.

## Building with the AI harness

This repo ships an AI-agent build system (`.claude/` + `memory/`). Current status:
**Stage 1 (Foundation) in progress** — see
[`memory/project-state.md`](memory/project-state.md) and
[`memory/plans/_active/2026-07-17-stage-1-foundation.md`](memory/plans/_active/2026-07-17-stage-1-foundation.md).
Entry point for the harness: [`.claude/GUIDE.md`](.claude/GUIDE.md); stage-by-stage build plan:
[`docs/06-implementation-plan.md`](docs/06-implementation-plan.md).
