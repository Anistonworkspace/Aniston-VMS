# Aniston VMS — Build Progress (v1.4 9-stage plan)

Tracks the REAL plan: `docs/06-implementation-plan.md` (aniston-vms-plan-v1.4, 9 stages).
Design canon: `docs/04-uiux-brief.md` + `docs/actual-design.png` (soft-SaaS: cream canvas, slate sidebar, white cards, sage/indigo/coral/sand).

**Status: all 9 stages implemented, integrated, Docker-rebuilt and end-to-end verified.**

| # | v1.4 Stage | Backend | Frontend | Notes |
|---|-----------|---------|----------|-------|
| 1 | Foundation (auth, RBAC, hierarchy CRUD, simulator) | ✅ | ✅ | JWT+refresh, RBAC roles, region/site/zone CRUD, seed, `simulator/` with MediaMTX + FFmpeg cams + fault injector |
| 2 | Health engine | ✅ | ✅ | Checkers/scheduler/diagnosis/hysteresis + health charts UI; `/api/cameras/health`, `/api/zones/health-rollup` verified 200 |
| 3 | Snapshot engine | ✅ | ✅ | Capture pipeline, storage adapter (local default, S3 driver via env), snapshot strip + grid UI; `/api/cameras/:id/snapshots/grid` verified 200 |
| 4 | Incidents & alerts | ✅ | ✅ | Engine/lifecycle/escalation/recovery + Kanban UI; alert deliveries verified 200 |
| 5 | Image analysis & analytics | ✅ | ✅ | jpeg-js luma/blur/frozen/dust detectors + reference approval + analytics page |
| 6 | Live view & wall (MediaMTX) | ✅ | ✅ | Path provisioning, auth webhook, sessions, HLS live wall |
| 7 | SD playback, clips & SD health | ✅ | ✅ | Adapter interface (OnvifG/Hikvision/Dahua/Sim), clips, scrubber UI |
| 8 | Reports & SLA | ✅ | ✅ | Uptime/MTTA/MTTR/SLA + xlsx/pdf export; `/api/reports/uptime` + `/api/reports/incidents` (require `startDate`/`endDate`) verified 200 |
| 9 | Hardening | ✅ | ✅ | Platform health, Prometheus metrics, audit log (`/api/audit-log` verified 200), self-monitoring |

## Cross-cutting items closed in this pass
- **BullMQ**: all setInterval schedulers/workers converted to BullMQ repeatable jobs (Redis-backed, restart-safe).
- **S3**: storage adapter (local default, S3-compatible driver via env).
- **DB migrations**: versioned baseline migration in `prisma/migrations/` (replaces push-only flow).
- **Simulator**: `simulator/` with MediaMTX + 6 FFmpeg cams + fault injector.
- **Frontend**: full app — login, cameras, camera detail, incidents kanban, alerts, live wall, playback/clips, analytics, reports, admin hierarchy, platform health, settings — on the soft-SaaS theme.
- **Tests**: unit tests for report calcs, analysis detectors, playback adapters, hierarchy service — passing.
- **Typecheck/lint**: full workspace typecheck clean (backend + frontend + shared).

## End-to-end verification (this pass, live Docker stack)
- `docker compose -f docker-compose.fullstack.yml` rebuild: all 4 containers healthy — `aniston_vms_backend`, `aniston_vms_frontend`, `aniston_vms_postgres`, `aniston_vms_redis`.
- Login `POST /api/auth/login` (demo `admin@anistonvms.example` / `AdminDemo2026!`) → access token issued.
- Verified 200 with auth: `/api/cameras`, `/api/incidents`, `/api/users`, `/api/cameras/health`, `/api/zones/health-rollup`, `/api/alerts/deliveries`, `/api/reports/uptime`, `/api/reports/incidents`, `/api/cameras/:id/snapshots/grid`, `/api/audit-log`.
- Frontend `http://localhost:5173/` → 200.

## Verified working (earlier passes, still true)
- Health→incident wiring verified live: sim fault → `ANI-CAM-2026-000006` CRITICAL → mock EMAIL+WHATSAPP DELIVERED → full lifecycle (ack→assign→investigate→resolve→close) → recovery.

## Honest status legend
✅ done · 🟡 partial · 🔨 in build · ❌ not started
