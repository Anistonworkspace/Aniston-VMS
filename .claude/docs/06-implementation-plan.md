# Aniston VMS — Implementation Plan

**Doc version: v1.0 · 17 July 2026 · Built for plan v1.3**

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

## 2. Stages

### Stage 1 — Foundation
- [ ] Auth: JWT access+refresh, RBAC, MFA (TOTP) for admins, login rate limit
- [ ] **Zone-scoped access:** `user_access_scopes` + scope-guard middleware on every query
- [ ] Region/zone CRUD seeded with the Delhi structure (4 regions, 13 zones)
- [ ] Sites/routers/cameras CRUD incl. move-between-zones with confirmation + audit
- [ ] RTSP config form: validation, normalized-hash **duplicate prevention**, "Test connection", encrypted credential storage
- [ ] ONVIF capability auto-detection on camera add (brand/model/Profile G → `playback_adapter`)
- [ ] Prisma schema + migrations + seeds; Redis/BullMQ wiring; audit logging; camera list UI
- [ ] Simulator: 6 FFmpeg fake cameras publishing to MediaMTX; fault-injector skeleton

**Accept/Demo:** Rohini-scoped engineer sees only Rohini; duplicate RTSP rejected naming the conflict; camera moved zones with audit entry; capabilities detected on add.

### Stage 2 — Health engine
- [ ] Router TCP, RTSP port, RTSP auth, FFprobe video validation workers
- [ ] Jittered scheduler (~25 cams/min), retries, hysteresis, status history
- [ ] Health score + status model; **diagnosis engine** (7 causes); connection-quality hourly rollup
- [ ] Camera detail health charts + `DiagnosisBanner`; zone rollups

**Accept/Demo:** fault-injector scenarios yield distinct diagnoses — "Internet down at site" vs "Camera offline — router online" vs "Unstable network"; thresholds respected.

### Stage 3 — Snapshot engine
- [ ] 15-min sub + hourly evidence snapshot pipeline → S3 layout → metadata → thumbnails
- [ ] Retention workers (originals 90 d / incident 3 y / thumbs 1 y; short TTL in dev) + S3 lifecycle
- [ ] Snapshot strip on camera detail; signed URLs only

**Accept/Demo:** hourly grid fills for all sim cameras; retention prunes; incident-linked snapshots protected.

### Stage 4 — Incidents & alerts
- [ ] Incident creation with rule matrix, dedup, numbering, lifecycle, `incident_events` timeline
- [ ] Dependency suppression (router ⊃ cameras) + site grouping + maintenance windows + cooldown
- [ ] SES email (HTML, snapshot compare links) + bounce webhook — **mock mode default**
- [ ] WhatsApp Cloud API: 3 templates, status webhook, **Acknowledge button** → incident update
- [ ] Escalation worker 0/10/20/30/60 with per-zone overrides; recovery after 2 good checks + recovery notice + downtime calc
- [ ] Incident Kanban + drawer; alert-delivery dashboard

**Accept/Demo:** kill sim stream → 3 fails → incident → mock email/WA logged with statuses → escalation fires → restore → recovery verified & notified.

### Stage 5 — Image analysis & analytics
- [ ] OpenCV service: black/white/dark/bright/blur/frozen/obstruction/scene-shift/color-cast/noise/**dust**
- [ ] Reference-image approval UI; per-camera thresholds; breaches → incidents with evidence
- [ ] **Analytics dashboard:** quality & dust trends per camera/zone; "Needs cleaning" list → auto `maintenance_tasks` (zone engineer); before/after compare

**Accept/Demo:** injector serves black → black incident; serves hazy/dusty → dust score rises, camera enters "Needs cleaning", task auto-created.

### Stage 6 — Live view & wall
- [ ] MediaMTX on-demand paths (sub+main) via API; auth webhook validating stream JWTs
- [ ] `POST live/start` with scope + limits (≤1 HD per camera, ≤3/site); heartbeats; idle "Still watching?" teardown; `stream_sessions` + SIM byte estimates
- [ ] `PlayerShell` live mode; **Live Wall** 1×1/2×2/3×2, saved layouts, tile overlays/reconnect; HD toggle with warning

**Accept/Demo:** 5 sim cameras on 3×2 wall; 2nd HD session refused; idle session auto-closes; MediaMTX drops camera when last viewer leaves.

### Stage 7 — SD playback, clips & SD health
- [ ] `CameraPlaybackAdapter` + OnvifG / Hikvision / Dahua implementations, chosen per camera
- [ ] Day segment sync → `recording_segments`; playback windows ≤60 min via MediaMTX→HLS; seek; speed 1×/2×/4×
- [ ] `PlayerShell` playback mode + `TimelineScrubber` + `ClipRangeSelector`
- [ ] Clip export jobs (FFmpeg → S3, ≤15 min) + Clips library + attach-to-incident
- [ ] SD health hourly check → `SD_CARD_*` incidents; simulator fakes a recording archive

**Accept/Demo:** open yesterday on a sim camera, scrub/seek, change speed, export a 2-min clip, download, attach to an incident; unplugged-SD sim raises `SD_CARD_MISSING`.

### Stage 8 — Reports & SLA
- [ ] Uptime (camera/site/zone), downtime, MTTA/MTTR, repeated faults, SIM performance, snapshot completeness, SLA violations vs target, zone image-quality & cleaning, engineer performance, audit
- [ ] PDF + Excel export; scheduled email delivery; report screens

**Accept/Demo:** monthly report from seeded history exports in both formats with correct math.

### Stage 9 — Hardening
- [ ] Self-monitoring alerts (heartbeat, queues, deps, workers, disk, SSL) + Platform-health page
- [ ] Prometheus metrics + Grafana dashboards; backups runbook; helmet/rate limits/session expiry
- [ ] Load test full 125-camera schedule; scripted failure drills (the 20 mandatory scenarios) via fault-injector; SOP docs

**Accept/Demo:** kill a worker → self-alert; drill script produces exactly the expected incidents; load test passes targets.

## 3. PROGRESS.md template

```
# Aniston VMS — Progress   (building against plan v1.3, docs v1.0)
- [x] Stage 1 — Foundation   ✅ 2026-07-19   demo: <steps>   notes: <links>
- [ ] Stage 2 — Health engine
...
## Doc changes
| Date | Doc | v | Change |
```
