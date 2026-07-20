# Aniston VMS — Build Progress (v1.4 9-stage plan)

Tracks the REAL plan: `docs/06-implementation-plan.md` (aniston-vms-plan-v1.4, 9 stages).
Design canon: `docs/04-uiux-brief.md` + `docs/actual-design.png` (soft-SaaS: cream canvas, slate sidebar, white cards, sage/indigo/coral/sand).

**Status: all 9 stages implemented, integrated, Docker-rebuilt and end-to-end verified.**

---

## 🚧 Now building against **plan v1.5** (change order v1.5)

**Part A — docs** updated across both trees (`.claude/docs/` + `docs/`), bumped to plan v1.5:
master-prompt → v1.5 · `01-PRD` → v1.1 · `02-TRD` → v2.0 · `03-app-flow` → v1.1 · `04-uiux-brief` → v3.0 · `05-backend-schema` → v1.1 · `06-implementation-plan` → v2.0. See `docs/CHANGELOG.md`.

**Part B — implementation: COMPLETE. §4 migration landed (`20260718130535`, single migration, no db-push drift), all CR-1…CR-12 done, gates green (typecheck + lint clean, 74/74 unit).** Scope: CR-1 sidebar/profile relocation · CR-2 dashboard KPI row · CR-3 site+camera RBAC + `LIVE_VIEW` · CR-4 Live Wall v2 · CR-5 snapshot stamping/compression/retention · CR-6 add-camera modal + MapLibre 3D map · CR-7 incidents list view · CR-8 clickable zone pages · CR-9 clips/storage policies · CR-10 Settings expansion · CR-11 load test + waterlogging roadmap · CR-12 carried v1.4 gaps. One Prisma migration (`§4` data model).

### Part B change-request progress
| CR | Item | Status | Notes |
|----|------|--------|-------|
| CR-1 | Sidebar/profile relocation | ✅ done | Account menu moved to Sidebar bottom card + Topbar trim; add-camera card in sidebar; `AnimatedPopover` placement; typecheck+lint green; E2E green |
| CR-2 | Dashboard KPI row | ✅ done | 8 scope-aware linked KPI tiles (`useGetDashboardOverviewQuery`), Worst-connections + Missing-snapshots widgets, removed dashed add-card; `/api/dashboard/overview` scope-filtered; CamerasPage `?status=` deep-link; E2E 15/15 green; typecheck+lint green |
| CR-3 | Site+camera RBAC + `LIVE_VIEW` | ⏳ pending | |
| CR-4 | Live Wall v2 | ⏳ pending | |
| CR-5 | Snapshot stamping/compression/retention | ⏳ pending | |
| CR-6 | Add-camera modal + MapLibre 3D map | ⏳ pending | |
| CR-7 | Incidents list view | ✅ done | Filterable incidents page (severity/status/zone/date) + detail drawer with lifecycle actions over `/api/incidents`; FE typecheck+lint + E2E green |
| CR-8 | Clickable zone pages | ✅ done | Populated `/zones/:id` (KPIs, sites, cameras, open incidents, uptime) via `useListZoneSummariesQuery` + `/api/dashboard/zones`; dashboard zone cards + sidebar zone links navigate; E2E 17/17 green; tsc FE+BE, lint, 56/56 backend unit green |
| CR-9 | Clips/storage policies | ✅ done | Clips browser + BullMQ clip exports with retention; per-zone/site storage policies enforced on capture; backend unit suite green |
| CR-10 | Settings expansion | ✅ done | Admin-gated Settings tabs: system caps/retention + capacity overview (`/settings/system`, `/settings/capacity`) and storage policies + snapshot ZIP backups (`/settings/storage-policies`, `/settings/backups`) |
| CR-11 | Load test + waterlogging roadmap | ⏳ pending | |
| CR-12 | Carried v1.4 gaps | ⏳ pending | |

The v1.4 9-stage baseline below stays complete/verified and is the foundation for v1.5.

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
- **Admin feature** (`frontend/src/features/admin/`): role-gated `/admin` page with Users (CRUD + access scopes), Escalation (policies/steps + zone alert recipients), Notifications (delivery log), and Audit Log tabs; wired into router, sidebar (admin/auditor only), and the shared RTK Query slice.
- **Tests**: unit tests for report calcs, analysis detectors, playback adapters, hierarchy service — passing.
- **Typecheck/lint**: full workspace typecheck clean (backend + frontend + shared).

## End-to-end verification (this pass, live Docker stack)
- `docker compose -f docker/docker-compose.fullstack.yml up -d --build backend frontend` rebuild: all 4 containers healthy — `aniston_vms_backend`, `aniston_vms_frontend`, `aniston_vms_postgres`, `aniston_vms_redis`.
- Full workspace typecheck clean (backend + frontend + shared, `tsc --noEmit` exit 0); lint clean; unit tests **74/74 passing** — backend 71/71 (9 files) + frontend 3/3 (1 file).
- **Full Playwright E2E suite executed and green — 24/24 passing** against the live Docker stack: `e2e/app.spec.ts` (CR-1 sidebar/profile, CR-2 KPI deep-links, CR-8 zone pages), `e2e/cr12.spec.ts` (CR-4/6/7/9/10 + settings snapshot backup), `e2e/auth.spec.ts` (login/guards). CR-3 RBAC is enforced server-side and covered by service tests (`playback.service.test.ts` — LIVE_VIEW grant + access-scope ForbiddenError; `clip.service.test.ts` + `hierarchy.service.test.ts` scope filtering).
- This pass fixed the last E2E gaps: (1) camera inline-rename added in `CameraDetailDrawer` + spec; (2) auth cold-load 401 fixed in `api.ts` (refresh-then-retry on the `/auth/me` bootstrap so every deep-link/reload lands authenticated); (3) `cr12` snapshot-backup spec hardened — poll the async zone `<select>` until options populate, and target the backups table by its unique `Status` header instead of first-matching the storage-policies table.
- Login `POST /api/auth/login` (demo `admin@anistonvms.example` / `AdminDemo2026!`) → access token issued.
- Verified 200 with auth: `/api/cameras`, `/api/incidents`, `/api/users`, `/api/cameras/health`, `/api/zones/health-rollup`, `/api/alerts/deliveries`, `/api/reports/uptime`, `/api/reports/incidents`, `/api/cameras/:id/snapshots/grid`, `/api/audit-log`, `/api/escalation-policies`, `/api/zone-alert-recipients`, `/api/notifications`.
- Frontend `http://localhost:5173/` and `/admin` → 200.

## Verified working (earlier passes, still true)
- Health→incident wiring verified live: sim fault → `ANI-CAM-2026-000006` CRITICAL → mock EMAIL+WHATSAPP DELIVERED → full lifecycle (ack→assign→investigate→resolve→close) → recovery.

## Honest status legend
✅ done · 🟡 partial · 🔨 in build · ❌ not started
