# Aniston VMS — Docs Changelog

Version bumps to the planning docs. Newest first. The doc set lives in
`.claude/docs/` and is mirrored in top-level `docs/`; both trees are kept
byte-identical.

## 2026-07-21 — v1.5 acceptance: full Playwright E2E suite green (24/24)

Code changes (not doc bumps), closing out Part B (P6 / CR-11–CR-12):

- **Camera inline-rename (CR-11 gap):** added inline name edit in `CameraDetailDrawer`
  (`PATCH /api/cameras/:id`, optimistic cache update) with Playwright coverage.
- **Auth cold-load fix:** `api.ts` now refreshes-then-retries the `/auth/me` bootstrap
  on a 401, so every deep-link / hard reload lands authenticated instead of bouncing
  to `/login` — the root cause of the flaky cold-load E2E runs.
- **`cr12` snapshot-backup spec hardened:** poll the async zone `<select>` until its
  options populate before selecting, and target the backups table by its unique
  `Status` header (the storage-policies table renders first and was winning the row
  locator, so the row never showed a `DONE` status).

Gate: frontend + backend typecheck & lint clean, 74/74 unit tests (backend 71/71,
frontend 3/3), **Playwright E2E 24/24** — all green against the live Docker stack.

## 2026-07-19 — v1.5 implementation: §4 migration + CR-3…CR-7, CR-9, CR-10 shipped

Code changes (not doc bumps), continuing Part B (P2–P5):

- **§4 data model:** single Prisma migration + v1.5 seed (scopes, storage policies,
  system settings, backups) verified row-by-row in Postgres.
- **CR-3 — RBAC + `LIVE_VIEW`:** site/camera-level scopes with `LIVE_VIEW`
  enforced on the backend (live-session gating) and honored in the frontend.
- **CR-4 / CR-5 — Live Wall v2 + snapshots:** sticky focus + filmstrip,
  snapshot⇄live toggle, interval editor; stamped/compressed snapshots with
  retention.
- **CR-6 — Add-camera + map:** add-camera modal (test connection → save) and the
  MapLibre map view.
- **CR-7 — Incidents list view:** filterable incidents page + detail drawer with
  lifecycle actions over `/api/incidents`.
- **CR-9 — Clips/storage policies:** clips browser + BullMQ clip exports with
  retention; per-zone/site storage policies enforced on capture.
- **CR-10 — Settings expansion:** admin-gated Settings tabs — system
  caps/retention, capacity overview, storage policies and snapshot ZIP backups
  (`/settings/*`, SUPER_ADMIN/PROJECT_ADMIN only).

Gate: frontend + backend typecheck & lint, 59/59 backend unit tests, Playwright
E2E 17/17 — all green against the rebuilt Docker stack. Next: P6 (CR-11 load
test + capacity report, CR-12 carried v1.4 gaps), then final acceptance.

## 2026-07-18 — v1.5 implementation: CR-1 + CR-2 + CR-8 shipped

Part B implementation underway (P0 gate approved). Code changes (not doc bumps):

- **CR-1 — Sidebar/profile relocation:** moved the account/profile menu out of the
  Topbar into a bottom card in the `Sidebar` (`AnimatedPopover`, logout + role label);
  added the add-camera entry to the sidebar; trimmed the Topbar profile chip. Frontend
  typecheck + lint green; Playwright nav/auth E2E 14/14 green.
- **CR-2 — Dashboard KPI row:** 8 scope-aware linked KPI tiles driven by
  `useGetDashboardOverviewQuery` (`/api/dashboard/overview`, scope-filtered on the
  backend by the caller's access scope), plus Worst-connections and Missing-snapshots
  widgets; removed the dashed add-card. `CamerasPage` now honors a `?status=` deep-link
  from the tiles. Backend + frontend Docker containers rebuilt; Playwright E2E 15/15
  green; frontend typecheck + lint green.

- **CR-8 — Clickable zone pages:** populated `/zones/:id` detail page (zone KPIs,
  sites, cameras, open incidents, uptime) backed by `useListZoneSummariesQuery`
  (`/api/dashboard/zones`, scope-filtered); dashboard zone cards and sidebar zone
  links now navigate to the zone page. Playwright E2E 17/17 green; frontend +
  backend typecheck, lint and 56/56 backend unit tests green.

Next: stale-stack doc sweep, then P2 (§4 data-model migration + CR-3 RBAC).

## 2026-07-18 — plan v1.4 → **v1.5** (change order v1.5)

Driven by `aniston-vms-change-order-v1.5.md` (CR-1 … CR-12). The as-built stack
is accepted as official (Express + TypeScript + Prisma, Redux Toolkit + RTK
Query, BullMQ, MediaMTX — not NestJS/TanStack); image analysis stays in JS/TS
for v1.5 (Python/OpenCV deferred to the Phase-2 waterlogging roadmap). Design
system unchanged (doc-04 tokens: cream/white/slate/sage/indigo/coral, Poppins +
Inter, rounded cards).

| Doc | Version | Summary of v1.5 changes |
|-----|---------|-------------------------|
| `claude-code-master-prompt.md` | plan v1.4 → **v1.5** | New changelog row for CR-1…CR-12 + stack decisions; doc-version references bumped |
| `01-PRD.md` | v1.0 → **v1.1** | KPI dashboard; site/camera-level RBAC + `LIVE_VIEW`; Live-Wall snapshot mode + interval management; snapshot authenticity stamping; 3D map view; storage policies + ZIP backup; capacity limits; waterlogging Phase-2 roadmap |
| `02-TRD.md` | v1.0 → **v2.0** | Stack rewritten to as-built reality (Express/Prisma/RTK Query/BullMQ/MediaMTX; JS detectors; Python/OpenCV → Phase-2); MapLibre GL JS mapping; `sharp` stamp/compression pipeline; backup job design; stream-cap enforcement; load-test plan |
| `03-app-flow.md` | v1.0 → **v1.1** | Flows: live⇄snapshot toggle (permission-gated); add-camera modal (test → save → detect); backup-before-purge; map search → flyTo; zone-click navigation |
| `04-uiux-brief.md` | v2.0 → **v3.0** | Sidebar profile relocation + card removals; dashboard KPI row; Live Wall v2 (sticky focus, filmstrip, interval editor, independent scroll); MapLibre map + pin/popover; incidents list view; Settings sections; stamp visual spec; clips/snapshot browser. Reconciled to the as-built **edge-to-edge** layout. |
| `05-backend-schema.md` | v1.0 → **v1.1** | §4 one-migration data model: enums (`ScopeType`+=`CAMERA`, `PermissionType{LIVE_VIEW}`, `IncidentType`+=`WATERLOGGING`); tables `user_permissions`, `storage_policies`, `system_settings`, `backups`; `cameras` +lat/long/interval; `snapshots` +stamp fields; seed notes |
| `06-implementation-plan.md` | v1.0 → **v2.0** | Replaced the 9-stage list with phases **P0–P6** + per-CR acceptance criteria + carried v1.4 gaps + real-camera final acceptance |

**Baseline carried forward:** the v1.4 9-stage build (all implemented, Docker-deployed,
E2E-verified; 56 backend tests + 14 Playwright tests green) remains the foundation for v1.5.
