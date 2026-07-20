# Aniston VMS — Implementation Plan

**Doc version: v2.0 · 18 July 2026 · Built for plan v1.5**

---

## 0. Working agreement

One stage at a time → run `pnpm lint && pnpm typecheck && pnpm build` + tests + `docker compose up -d` health → demo via simulator → update `docs/PROGRESS.md` (with plan version) → wait for approval. Schema changes have a **single owner per stage** (no parallel migrations). API contracts (zod schemas / OpenAPI) are defined **before** frontend and backend tracks split.

## 1. Parallel-execution map (for Claude Code subagents)

| After | Parallel tracks |
|---|---|
| Stage 1 merged | **A:** API + workers (NestJS/BullMQ) · **B:** Frontend (against contracts + mock server) · **C:** Python image-analysis service · **D:** MediaMTX config + simulator + fault-injector |
| Within stages | Backend endpoints ∥ frontend screens ∥ worker jobs, integrating at stage end |
| Never parallel | Prisma migrations · `docker-compose.yml` edits · auth/scope-guard core |

Track D (simulator) should be built **early in Stage 1** so every later track can test against fake cameras.

## 2. Phases (v1.5 change order)

The v1.4 9-stage build (Foundation → Health → Snapshots → Incidents/alerts → Image analysis → Live view/wall → SD playback/clips → Reports/SLA → Hardening) is **complete and verified** — 56 backend tests + 14 Playwright specs green, Docker-deployed and E2E-checked — and is the frozen foundation. v1.5 is delivered as **phases P0–P6** layered on top; each phase ships behind its gate before the next begins. Change requests are labelled CR-1 … CR-12.

### P0 — Docs update (this Part A)
- [ ] Bump this plan to v2.0 / plan v1.5; replace the Stage list with the P0–P6 phase plan; record acceptance per CR.
- [ ] Docs-only — no code, schema, tests, configs or builds in this part; do not touch `PROGRESS.md` or `CHANGELOG.md`.

**Gate:** user approval of this document.

### P1 — Navigation & dashboard (CR-1, CR-2, CR-8)
**Contents:** CR-1 sidebar/profile relocation · CR-2 dashboard KPI upgrade · CR-8 zone pages.

**Acceptance:**
- CR-1 — [ ] No add-camera card anywhere in the sidebar; [ ] the profile menu works from the sidebar on every page; [ ] the topbar carries no profile chip (only the notification bell + "Open Live Wall").
- CR-2 — [ ] Dashboard shows a KPI row — Total cameras · Healthy · Unavailable/Offline · Warning · Maintenance · Open incidents · Snapshot success (24 h) · Active live sessions — with live, scope-aware numbers that link to the matching filtered lists; [ ] no dashed add card; [ ] all tiles are scope-aware; [ ] "Worst connections" and "Missing snapshots" widgets are present.
- CR-8 — [ ] Clicking any sidebar zone (or a dashboard zone card) opens its populated `/zones/:id` page (KPIs, sites, cameras, open incidents, uptime).

**Gate:** UI review + E2E navigation.

### P2 — Data model & RBAC (CR-3)
**Contents:** Migration for the §4 data model · CR-3 RBAC/permissions (site + camera scopes, `LIVE_VIEW`) · Settings→Access screen.

**Acceptance:**
- CR-3 — [ ] A demo engineer scoped to 2 cameras sees exactly those 2 everywhere; [ ] revoking `LIVE_VIEW` flips their Live Wall to snapshots immediately; [ ] admin-only settings sections are invisible (not merely disabled) to non-admins.

**Gate:** scope/permission E2E.

### P3 — Live Wall v2 & snapshots (CR-4, CR-5)
**Contents:** CR-4 Live Wall v2 · CR-5 snapshot stamping / compression / retention.

**Acceptance:**
- CR-4 — [ ] Permission-gated Live/Snapshots toggle works (lock + "Ask your administrator" shown without `LIVE_VIEW`); [ ] 24 h filmstrip + previous-day browsing works; [ ] per-camera interval editable 1–60 min with a projected-storage calculator and a <15 min warning; [ ] independent (sticky-focus) scroll verified; [ ] the zone filter respects scope.
- CR-5 — [ ] Every new snapshot (filmstrip, clips browser, evidence card) visibly carries the stamp (timestamp IST · site · zone · lat,long · CAM-code); [ ] metadata matches the stamp; [ ] the storage math is reflected in the interval calculator; [ ] compression tiering applied; [ ] retention default 30 d (configurable), incident-linked 3 y.

**Gate:** toggle + filmstrip E2E.

### P4 — Add-camera & map (CR-6)
**Contents:** CR-6 add-camera modal + MapLibre map view.

**Acceptance:**
- CR-6 — [ ] A camera can be added fully from the modal incl. lat/long, with Test connection (DESCRIBE + one frame) and duplicate-RTSP validation; [ ] the MapLibre 3D map renders 125 seeded pins with correct status colours (sage/amber/coral/indigo); [ ] searching "Rohini" flies to Rohini and shows its cameras; [ ] the list/map toggle is preserved.

**Gate:** map + modal E2E.

### P5 — Incidents, clips & Settings (CR-7, CR-9, CR-10)
**Contents:** CR-7 incidents list view · CR-9 clips/storage organization · CR-10 Settings (backup, capacity).

**Acceptance:**
- CR-7 — [ ] The dense list is the default view, filterable by severity/status/zone/date; [ ] a row opens a detail drawer with ack/assign/resolve actions; [ ] the board view is still available; [ ] a stats strip shows open-by-severity and MTTA today.
- CR-9 — [ ] Disabling clip storage for a site blocks new exports there with a clear message; [ ] the snapshot browser navigates Zone→Site→Camera→date with stamped previews; [ ] the clips table gains site/zone columns + filters.
- CR-10 — [ ] A backup ZIP of one site/day downloads and opens; [ ] exceeding the live-stream cap returns a friendly limit message; [ ] a non-admin sees no admin sections (Access / Storage & Backup / Capacity / Cameras hidden).

**Gate:** backup + policy E2E.

### P6 — Load test, roadmap & carried v1.4 gaps (CR-11, CR-12)
**Contents:** CR-11 load test + capacity report + roadmap docs · CR-12 drills / Grafana / runbook / SOP / adapter + email verification.

**Acceptance:**
- CR-11 — [ ] A load-test script (k6/artillery) simulates the 125-camera schedule + snapshot ingest + concurrent viewers and outputs `docs/capacity-report.md` with an upgrade/no-upgrade verdict; [ ] waterlogging is documented as a Phase-2 roadmap item (PRD) with a `WATERLOGGING` enum placeholder + a commented analysis hook (no ML in v1.5); [ ] inline rename for regions/zones/sites/cameras is verified; [ ] every per-camera/site record requires an RTSP link + lat/long + site info.
- CR-12 (carried v1.4 gaps) —
  - Stage-9 remainder — [ ] 20 scripted failure drills via the fault-injector + Grafana dashboards + a backups runbook + SOP docs.
  - Stage-7 — [ ] `CameraPlaybackAdapter` + Onvif/Hikvision/Dahua implementations compile against the interface (SIM functional; real adapters may be typed stubs).
  - Stage-8 — [ ] The recurring scheduled-report email delivery job exists and runs (mock transport OK).
  - Migration — [ ] A REAL Prisma migration for the v1.5 schema (no `db push` drift).
  - Playwright — [ ] New specs for the permission-gated live toggle, add-camera modal validation + duplicate RTSP, map load + flyTo, zone-click navigation, clips filters + storage-policy block, and backup job download.

**Gate:** all suites green + drill script.

### Non-regression rules
- [ ] Design system stays on the **doc-04 tokens** — cream/white/slate/sage/indigo/coral, Poppins + Inter, rounded cards; doc-04 v3.0 only *adds* the new layouts listed above (no redesign, no new palette).
- [ ] The existing green suites (56 backend unit, Playwright, `typecheck`, `lint`) stay green after every phase.
- [ ] No breaking API changes without updating the RTK Query slices **and** the shared zod schemas together in the same change.

## 3. PROGRESS.md template

```
# Aniston VMS — Progress   (building against plan v1.5, docs v2.0)
- [x] Stage 1 — Foundation   ✅ 2026-07-19   demo: <steps>   notes: <links>
- [ ] Stage 2 — Health engine
...
## Doc changes
| Date | Doc | v | Change |
```

## Final acceptance — real camera on local machine

A manual end-to-end pass against one physical camera on the operator's LAN, run after P6:

1. [ ] `docker compose -f docker/docker-compose.fullstack.yml up -d`, then log in as **admin**.
2. [ ] **Cameras → Add camera** → paste a real RTSP URL (e.g. `rtsp://user:pass@192.168.1.64:554/Streaming/Channels/101`), pick zone/site, set lat/long on the mini-map, run **Test connection** (must pass) → **Save**.
3. [ ] **Settings → Access** → confirm `LIVE_VIEW` → **Live Wall** → toggle **Live** → the real stream plays via MediaMTX (on-demand, `-rtsp_transport tcp`).
4. [ ] Set the snapshot interval to **1 min** → within 2–3 min the filmstrip shows **STAMPED** snapshots (time + site + zone + lat/long + CAM-code).
5. [ ] Toggle **Snapshots**, browse today + the previous day; export a 1-min clip and download it.

**Networking note:** containers must be able to reach LAN camera IPs — Docker NAT egress is normally fine; document the `host.docker.internal` / host-firewall edge cases.

**Deliverable:** a short `docs/real-camera-test.md` runbook — the steps above plus troubleshooting: **401 → credentials**, **timeout → port-forward/firewall**, **no video → wrong path/transport**.
