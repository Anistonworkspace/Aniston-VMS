# Tech Stack & Targets — Aniston VMS

Versions/targets per the plan docs (`02-TRD.md` v2.0 · 18 July 2026 · built for plan v1.5).
Update this file when dependencies are bumped.

**Canonical stack (decided, v1.5):** the **as-built stack is official** — an **npm-workspaces** monorepo: **Express + TypeScript (ESM)** (`backend/`) · **Prisma + PostgreSQL** · **BullMQ workers** (in-process, `backend/src/modules/*`) · **MediaMTX** (media plane) · **Redux Toolkit + RTK Query** (`frontend/`). There is **no NestJS/pnpm/FastAPI migration**; image analysis stays **JS/TS in-worker** for v1.5 (Python/OpenCV deferred to the Phase-2 waterlogging roadmap). The on-disk `backend/` **is** the pattern to follow.

**Primary target: the web SPA.** The boilerplate's Capacitor/Electron shells remain in the repo
but are **out of scope for Aniston VMS v1** (a control-room web app).

---

## Frontend (web SPA)

| Concern | Choice | Notes |
|---|---|---|
| Framework | **React 18** | function components + hooks only |
| Language | **TypeScript 5.7** strict, ESM | |
| Build | **Vite 5** | `frontend/vite.config.ts` |
| Styling | **Tailwind CSS v3** + VMS design tokens | tokens per `04-uiux-brief.md` + `actual-design.png` |
| State | **Redux Toolkit + RTK Query** | server state in RTK Query cache only |
| Animation | **Framer Motion** | |
| Router | **React Router v6** | |
| Video | **WHEP (WebRTC)** primary, **HLS** fallback | played from MediaMTX; player work in Stages 4–5 |
| Serve | **Nginx** | SPA fallback + gzip + security headers |

## Backend

| Concern | Choice | Notes |
|---|---|---|
| Runtime | **Node.js 20+**, TypeScript, ESM | |
| Framework | **Express 4 + TypeScript (ESM)** | layered routers → services → Prisma; `zod` request validation; middleware auth guards (JWT + RBAC). Official as-built stack per v1.5 change order — no NestJS port. |
| ORM / DB | **Prisma 6** + **PostgreSQL 16** | schema source: `05-backend-schema.md` (28 tables) |
| Cache/queues | **Redis 7** + **BullMQ** | probes, snapshots, notifications, clip exports |
| Realtime | **Socket.io** | live health/incident updates to dashboards |
| Auth | **JWT access + refresh** (httpOnly cookie), MFA (TOTP) for admins | `02-TRD.md § Security` |
| Crypto | **AES-256-GCM** for RTSP credentials | decrypt only in workers |
| Testing | **Vitest** + **Playwright** (E2E) | |

## Media & monitoring plane

| Concern | Choice | Notes |
|---|---|---|
| Media server | **MediaMTX** | on-demand RTSP pull → **WHEP** (`/{path}/whep`) + **HLS** (`/{path}/index.m3u8`); auth via `POST /internal/media-auth` |
| Probing | **FFprobe/FFmpeg** workers | `RTSP_AUTH` / `RTSP_PORT` / `ROUTER_TCP` checks, snapshot capture |
| Image analysis | **JS/TS in-worker detectors** (`sharp` + pixel heuristics) | brightness/blur/freeze/obstruction/scene-shift scoring; Python/OpenCV service deferred to Phase-2 waterlogging roadmap |
| Playback | Per-brand **PlaybackAdapter** | `ONVIF_G` (ONVIF Profile G) first; `HIKVISION` / `DAHUA` later |
| Cameras | RTSP + ONVIF, SD-card recording | fleet behind 4G **SIM routers** with public static IPs (~125 at launch) |
| Object storage | S3-compatible | snapshots, evidence, clip exports; lifecycle rules mirror DB retention |

## Notifications & observability

| Concern | Choice | Notes |
|---|---|---|
| WhatsApp | **WhatsApp Cloud API** | templated messages, delivery webhooks → `NotificationStatus` |
| Email | **AWS SES** | bounce/complaint handling |
| Metrics | **Prometheus + Grafana** | per `02-TRD.md` |
| Logs | Winston structured JSON (harness standard) | `rule-logging-standards.md` |

## Deployment

| Concern | Choice | Notes |
|---|---|---|
| Local dev | **docker compose** (`docker/`) | Postgres, Redis, MediaMTX, simulator cameras (seeds: 6 simulator cameras) |
| Envs | separate prod/test envs, encrypted backups | TRD security section |
| Network | HTTPS only; camera/router ports allow-listed to the two government IPs + VMS IP | TRD security section |

## Deferred targets (boilerplate capability, not VMS v1)

PWA/Workbox and Capacitor 6 (Android/iOS) build configs are retained from the boilerplate and
may be activated later (e.g. a field-engineer mobile app); just don't target them in phases P0–P6
unless the plan docs change. The Electron desktop shell (`agent-desktop/`) was removed from this
project — Aniston VMS is web-only. Restore it from the boilerplate repo if a desktop target is
ever needed.
