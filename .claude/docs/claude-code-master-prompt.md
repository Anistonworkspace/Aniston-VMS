# MASTER PROMPT — Aniston VMS (Aniston Video Management System)

**Plan version: v1.4 — 17 July 2026**

> **How to use this file:** Create a folder `aniston-vms`, open it in VS Code, start Claude Code, copy the provided planning docs into `docs/` (01–03, 05–06 at v1.0; 04 at v2.0) **plus the design reference image as `docs/actual-design.png`**, then paste this entire file as your first message. Fill in Section 10 (Assumptions) answers when Claude Code asks.

## Versioning policy

- This plan and every doc in `docs/` carries a version header. **Every change requested by the user bumps the version** (minor for additions, patch for fixes) with a line in the changelog below and in `docs/CHANGELOG.md`.
- Claude Code records the plan version it is building against in `docs/PROGRESS.md`, and bumps a doc's version whenever it edits that doc.

### Plan changelog

| Version | Date | Changes |
|---|---|---|
| v1.0 | 17 Jul 2026 | Initial plan: 5-stage health monitoring, hourly snapshots + image analysis, incidents, SES email + WhatsApp alerts with Acknowledge, escalation ladder, live view + 4–6 camera wall, SD-card playback + clip export, SD health, reports/SLA, camera simulator, 9 build stages |
| v1.1 | 17 Jul 2026 | Mixed-brand fleet: ONVIF-first per-camera capability auto-detection, per-camera playback adapter, Fleet Capability report |
| v1.2 | 17 Jul 2026 | Delhi zone hierarchy + zone-scoped RBAC & alert routing; RTSP configuration rules, duplicate prevention & Test-connection; root-cause diagnosis + connection-quality score; dust analytics + auto cleaning tasks; YouTube-grade `PlayerShell` |
| v1.3 | 17 Jul 2026 | Product named **Aniston VMS**; the six planning docs are now supplied as finished v1.0 files; parallel-execution workflow for Claude Code; this versioning policy |
| v1.4 | 17 Jul 2026 | **UI redesigned** to the provided light "soft SaaS" reference (`docs/actual-design.png`): slate sidebar with zone dots, cream canvas, white rounded cards, sage/indigo/coral/sand palette, Poppins + Inter, rounded app frame; doc 04 → **v2.0**; PlayerShell keeps charcoal chrome inside the light UI |

---

## 0. Your role and how to work

You are a senior full-stack architect and developer building a production system for Aniston. Work in **phases with approval gates**:

1. **Phase 0** — The six planning docs (v1.0) are **provided**; ensure they are in `docs/` (if any is missing, regenerate it from the outlines in Section 3). Read all six, cross-check them against this prompt (**this prompt wins on conflict**), list any gaps, ask me the Assumption questions (Section 10), and wait for my approval before writing any code.
2. **Phase 1** — Scaffold the monorepo, `CLAUDE.md`, `.claude/` config, Docker Compose, `.env.example`, and the camera simulator.
3. **Phases 2–10** — Implement build Stages 1–9 (Section 5), **one stage at a time**. After each stage: run lint/build/tests, update `docs/PROGRESS.md` with what was done and how to demo it, then wait for my go-ahead.

**Parallel execution:** Within and after Stage 1 (schema + auth + scope guard merged), split work into parallel tracks using subagents where independent — **Track A:** NestJS API + BullMQ workers · **Track B:** React frontend (built against typed contracts + a mock server) · **Track C:** Python image-analysis service · **Track D:** MediaMTX config + simulator + fault-injector. Serialize anything touching the Prisma schema or `docker-compose.yml` (single owner per stage); define API contracts (zod/OpenAPI) **before** tracks split; integrate and run the full compose stack before marking a stage done. Build Track D early so every other track can test against fake cameras.

Rules of engagement:
- Never invent real credentials, tokens, IPs, or phone numbers. Use `.env.example` placeholders.
- If information is missing, choose a sensible default, mark it `TODO(confirm)` in code/docs, and list it in `docs/ASSUMPTIONS.md`.
- Everything must run locally with `docker compose up` using the camera simulator — no real cameras required for development.
- Store all timestamps in UTC; display in IST (Asia/Kolkata).

---

## 1. Project context

Aniston operates **125 CCTV cameras** across sites in Delhi (e.g. Rohini zones). Each site has an **Airtel SIM router with a public static IP**. Two **government recording servers** already pull each camera's main RTSP stream directly — this platform must **never interfere** with that.

**Aniston VMS (Aniston Video Management System)** is Aniston's independent platform that:

1. **Monitors health** of every router and camera (network, RTSP, video, image quality) via short on-demand probes of the **substream**.
2. Captures an **hourly evidence snapshot** per camera, analyzes it (black/white/blur/frozen/obstructed/shifted), stores it in S3/MinIO.
3. Creates **incidents** with retry/hysteresis logic to prevent false alerts, sends **Email (Amazon SES)** and **WhatsApp (Meta Cloud API)** alerts, and **escalates** unresolved incidents (10/20/30/60 min ladder).
4. **NEW — Live view:** watch any camera live in the browser, and a **multi-camera wall** showing 4–6 cameras simultaneously (grid layouts 1×1, 2×2, 3×2).
5. **NEW — Playback:** each camera has a **128 GB SD card** recording locally. Users get YouTube/NVR-style playback — a per-day timeline of recorded segments, click-to-seek, 1×/2×/4× speed, and **clip export to MP4** (stored in S3, linkable to incidents).
6. **NEW — SD-card health:** monitor card present/full/recording status; alert when recording stops.
7. **Reports & SLA:** uptime, downtime, MTTA/MTTR, snapshot completeness, SLA violations, exports to PDF/Excel.
8. **NEW — Zone hierarchy & zone-scoped access:** Region → Zone → Site → Camera, seeded with Aniston's Delhi structure (North: Rohini, Civil Lines, Keshav Puram, Narela, Karol Bagh (CTSP) · South: Central, Hauz Khas · West: Rajouri Garden, Najafgarh · East: Shahdara North 1 & 2, Shahdara South 1 & 2). Zones/sites are fully manageable, cameras and sites can be moved between zones, and users can be granted access to **specific zones only** (Section 6.7).
9. **NEW — Root-cause diagnosis:** every fault gets a plain-language label distinguishing internet/SIM down at site vs weak signal vs unstable network vs camera offline vs configuration error vs degraded stream vs image problem (Section 6.9).
10. **NEW — Image-quality analytics:** dust-on-lens detection with a "Needs cleaning" list and auto-created maintenance tasks, plus quality trends per camera/zone (Section 6.10). All video surfaces use a **professional YouTube-grade player** (Section 6.11).

### Hard rules (non-negotiable)

- **No continuous third stream.** All probing and streaming is **on-demand**: connect, do the job, disconnect. The media gateway must drop the camera connection when no viewer is attached.
- **Grid/wall view uses substreams only** (~128–256 Kbps each). Main-stream (HD) live view is single-camera, on-demand, with a bandwidth warning.
- **Bandwidth guardrails:** the SIM router already uploads main streams to 2 government servers. Enforce: max 1 concurrent HD-live or playback session per camera; max 3 (configurable) total streaming sessions per site; idle-viewer timeout after 10 min ("Are you still watching?" prompt, Netflix-style); per-SIM data-usage tracking with monthly budget warnings.
- **Never send an alert on a single failed check.** Retry → consecutive-failure thresholds → hysteresis → dependency suppression (router down suppresses its cameras' alerts; site-level grouping) → notification cooldown → recovery requires 2 consecutive successes.
- **Security:** RTSP credentials encrypted at rest (AES-256-GCM, key from env); full RTSP URLs never sent to the browser; signed temporary URLs for snapshots/clips; RBAC; audit log; HTTPS only in production.
- A critical image condition (e.g. black image) overrides a good numeric health score.

---

## 2. Tech stack (locked)

| Component | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind + shadcn/ui + TanStack Query + Zustand |
| Video in browser | WebRTC via MediaMTX WHEP (live); hls.js for playback — wrapped in a custom `PlayerShell` with YouTube-grade controls (Section 6.11; media-chrome or Vidstack as base) |
| Backend API | Node.js 20 + NestJS + Prisma (PostgreSQL) + Zod validation |
| Workers | Separate Node processes using BullMQ (Redis) — probe, snapshot, analysis-dispatch, notification queues |
| Media gateway | **MediaMTX** (Docker: `bluenviron/mediamtx`) — on-demand RTSP pull → WebRTC/HLS; auth webhook to our API; paths managed via its HTTP API (`:9997`) |
| Camera probing | FFprobe / FFmpeg (RTSP over TCP) |
| Image analysis | Python 3.12 + FastAPI + OpenCV (separate service) |
| Database | PostgreSQL 16 (partition `health_checks` by month) |
| Queue/cache | Redis 7 |
| Object storage | MinIO (dev) / AWS S3 (prod), lifecycle rules for retention |
| Email | Amazon SES (+ SNS/webhook for bounce & delivery events) |
| WhatsApp | Meta WhatsApp Cloud API (approved utility templates + status webhooks) |
| Metrics | Prometheus + Grafana |
| Reverse proxy | Nginx |
| Auth | JWT access + refresh tokens; RBAC; MFA for admins (TOTP) |
| Deployment | Docker Compose (initial production) |
| Monorepo | pnpm workspaces |

---

## 3. The six planning docs — provided as v1.0 files (outlines below are the fallback spec)

The six docs already exist and should sit in `docs/`. Keep them as the working spec and bump their versions when they change. If any is missing, regenerate it from its outline below. Each must be complete enough that a developer could build from it alone.

**`docs/01-PRD.md`** — Problem statement; user roles (Super Admin, Project Admin, Monitoring Operator, Maintenance Engineer, Client Viewer, Auditor), each assignment carrying an **access scope: All / Region / Zone / Site** (Section 6.7); numbered feature list F1–F17 covering: registry (sites/routers/cameras), health monitoring, hourly snapshots, image analysis, incidents, email alerts, WhatsApp alerts + interactive Acknowledge button, escalation, **live view**, **multi-cam wall with saved layouts**, **SD playback + clip export**, **SD health**, **zone & region management with reassignment**, **root-cause connectivity diagnosis**, **image-quality & dust analytics with auto cleaning tasks**, reports/SLA, self-monitoring, audit; non-goals (not a recording replacement; no continuous third stream); success metrics (≥99% detection of real outages within 5 min, false-alert rate <5%, MTTA <10 min, dashboards load <2 s).

**`docs/02-TRD.md`** — Architecture diagram (cameras/routers → probes & MediaMTX → API/workers → Postgres/Redis/S3 → React); the 5-stage health pipeline with all status codes (Section 6.1); scheduler design that spreads 125 cameras across each interval (~25/min in a 5-min cycle, jittered); false-alert prevention mechanics; **root-cause diagnosis engine & connection-quality scoring** (Section 6.9); **RTSP configuration, validation & duplicate-prevention rules** (Section 6.8); **streaming design** (MediaMTX on-demand paths, WHEP/HLS endpoints, short-lived stream JWTs, auth webhook, session limits, idle timeout); **playback design** (adapter pattern: ONVIF Profile G ↔ Hikvision ISAPI ↔ Dahua; HLS playback windows up to 60 min; seek = re-request at new timestamp; speed via RTSP Scale where supported, else client-side); storage math (snapshots ≈ 1.5 GB/day at 125×24×~500 KB; SD 128 GB ≈ 5–6 days at 2 Mbps main or ~6 weeks at 256 Kbps sub); retention policy; security design; monitoring-the-monitor.

**`docs/03-app-flow.md`** — Mermaid diagrams + walkthroughs for: login → dashboard → camera detail; incident lifecycle (Detected → Confirmed → Alerted → Acknowledged → Assigned → Investigating → Resolved → Recovery-verified → Closed); escalation ladder 0/10/20/30/60 min with stop conditions; live-view session (request token → MediaMTX auth webhook → watch → idle prompt → teardown); playback session (pick date → timeline loads segments from SD → seek → export clip); WhatsApp Acknowledge button → incident update → escalation paused.

**`docs/04-uiux-brief.md`** — **Light "soft SaaS" theme replicated from `docs/actual-design.png` (doc v2.0)**: cream `#F6F5F1` surface + white rounded-20 cards in a rounded-28 app frame on a `#E8E8E6` canvas; slate `#5C6672` sidebar with zone sub-items carrying colored health dots and an admin "Add camera" dashed card; topbar with coral critical-count pill, centered search, one sage `#8FBCA0` primary CTA; Poppins display + Inter body; pastel ZoneCards + "Latest evidence" photo card + camera-health donut + recent-incidents list with avatar stacks; charcoal `#2B2724` reserved for video/player chrome. Screens: (A) Executive dashboard with summary cards (Total 125 / Healthy / Warning / Critical / Maintenance, uptime %, unacknowledged incidents) + widgets (health by status, zone-wise, incident trend, longest downtime, weakest SIM signals, missing snapshots, SLA); (B) Site & zone dashboard with map; (C) Camera grid with cards (ID, site, status badge, latest snapshot, last RTSP success, bitrate/FPS/resolution, signal dBm, open incident) and filters; (D) Camera detail (score, snapshot history 24h, stream config, health history charts, incident timeline, buttons: Run check / Capture snapshot / **Watch Live** / **Playback** / Maintenance mode); (E) **Live Wall** — layout picker 1×1/2×2/3×2, camera picker, saved layouts, per-tile status overlay + reconnect; (F) **Playback page** — date picker, 24-hour timeline scrubber showing recorded segments, player with speed controls + snapshot + "Export clip" (start/end markers, max 15 min); (G) Clips library; (H) Incident command centre (Kanban: New/Acknowledged/Assigned/In-Progress/Awaiting-Site-Visit/Resolved/Closed); (I) Alert-delivery dashboard (email + WhatsApp statuses, retries, next escalation); (J) Reports; (K) Admin (registry, users + zone scopes, alert rules, maintenance windows, platform health); (L) **Zone & region management** — tree view Region → Zone → Site → Camera, create/edit zones with map location, move sites/cameras between zones with confirmation + audit trail; (M) **Analytics** — image-quality & dust trends per camera/zone, "Needs cleaning" list, connection-quality charts and worst-connections widget. Every video surface uses the professional player spec in Section 6.11. Component inventory: `CameraCard, StatusBadge, HealthScoreRing, VideoTile, LiveWallGrid, TimelineScrubber, ClipRangeSelector, IncidentKanban, EscalationTimeline, SnapshotCompare (last-healthy vs current), SimSignalIndicator, ZoneTree, ScopeBadge, DiagnosisBanner, ConnectionQualityChart, PlayerShell`.

**`docs/05-backend-schema.md`** — Full Prisma-style schema for every table in Section 7 with columns, types, relations, indexes (esp. `health_checks(camera_id, started_at)`, `snapshots(camera_id, captured_at)`), partitioning note for `health_checks`, and retention jobs.

**`docs/06-implementation-plan.md`** — The 9 stages from Section 5, each expanded into concrete tasks with acceptance criteria and a demo script ("how I will show you it works using the simulator").

Also create `docs/PROGRESS.md` (stage checklist, all unchecked; records the plan version being built), `docs/ASSUMPTIONS.md`, and `docs/CHANGELOG.md` (doc/plan version history).

**Then stop and wait for my approval.**

---

## 4. Phase 1 — Repo scaffold + Claude config

```
aniston-vms/
├── CLAUDE.md
├── .claude/
│   ├── settings.json          # permissions: allow pnpm, docker compose, node, prisma
│   └── commands/
│       ├── next-stage.md      # read PROGRESS + implementation plan → build next stage → verify → update PROGRESS
│       ├── review.md          # diff current code vs docs/, list gaps & risks
│       └── run-checks.md      # lint, typecheck, build, tests, compose health
├── docs/                      # the six docs + PROGRESS + ASSUMPTIONS + CHANGELOG
├── apps/
│   ├── api/                   # NestJS (modules: auth, sites, routers, cameras, health, snapshots,
│   │                          #  incidents, alerts, streaming, playback, clips, reports, admin, webhooks)
│   ├── web/                   # React + Vite
│   └── workers/               # BullMQ processors: probe, snapshot, analysis, notify, escalate, retention
├── services/
│   ├── image-analysis/        # Python FastAPI + OpenCV
│   └── media/                 # MediaMTX config + auth-webhook notes
├── tools/
│   ├── camera-simulator/      # FFmpeg loops sample videos → publishes 6 fake RTSP cams to MediaMTX
│   └── fault-injector/        # scripts: kill a sim stream / serve black frames / freeze → triggers incidents
├── infra/                     # nginx, prometheus, grafana provisioning
├── docker-compose.yml         # api, web, workers, image-analysis, mediamtx, simulator,
│                              # postgres, redis, minio, nginx, prometheus, grafana
├── .env.example
└── package.json / pnpm-workspace.yaml
```

`CLAUDE.md` must contain: project one-liner; monorepo map; run commands (`docker compose up -d`, `pnpm dev`, `pnpm test`, migration commands); conventions (TS strict, Zod at boundaries, NestJS module per domain, no secrets in code, conventional commits); the Hard Rules from Section 1; and the instruction: *"Before major changes, re-read the relevant file in docs/. Track work in docs/PROGRESS.md."*

`.env.example` keys: `DATABASE_URL, REDIS_URL, S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, JWT_SECRET, JWT_REFRESH_SECRET, CREDENTIAL_ENCRYPTION_KEY, SES_REGION, SES_ACCESS_KEY, SES_SECRET_KEY, ALERT_FROM_EMAIL, WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_WEBHOOK_VERIFY_TOKEN, MEDIAMTX_API_URL, MEDIAMTX_WHEP_BASE, MEDIAMTX_HLS_BASE, PUBLIC_APP_URL, TZ_DISPLAY=Asia/Kolkata`.

---

## 5. Build stages (Phases 2–10)

**Stage 1 — Foundation:** Auth (JWT + refresh, RBAC with **zone-scoped access enforced by an API scope guard** (Section 6.7), MFA for admins), user management with scope assignment, **region/zone hierarchy CRUD seeded with the Delhi structure**, registry CRUD for sites/routers/cameras including move-between-zones, encrypted RTSP credential storage, **RTSP configuration form with validation, duplicate prevention and "Test connection"** (Section 6.8), ONVIF capability auto-detection on camera add (Section 6.6; simulator cameras seeded as `onvif_g`), Prisma schema + migrations + seed (4 regions, 13 zones, 2 sites, 2 routers, 6 simulator cameras), Redis/BullMQ wiring, camera list UI, audit logging. *Demo: a Rohini-scoped engineer sees only Rohini cameras/incidents; a duplicate RTSP URL is rejected naming the conflicting camera; a camera is moved to another zone with an audit entry; brand/capabilities detected; credentials stored encrypted.*

**Stage 2 — Health engine:** TCP router check, RTSP port check, RTSP auth (DESCRIBE), FFprobe video validation (codec/resolution/FPS/bitrate/frames advancing), health score (Router 20 + RTSP 25 + Video 25 + Image 20 + Config 10; 90+ Healthy / 75–89 Warning / 50–74 Major warning / <50 Critical; critical conditions override), jittered scheduler spreading 125 cameras, retries, status history, camera detail health charts, **root-cause diagnosis engine** labeling every fault in plain language (Section 6.9), **connection-quality score** (rolling success rate, latency, jitter, signal) with per-camera and per-zone history charts. *Demo: fault-injector scenarios produce distinct diagnoses — "Internet down at site" vs "Camera offline — router online" vs "Unstable network" — and status transitions respect thresholds.*

**Stage 3 — Snapshot engine:** 15-min substream snapshot + hourly evidence snapshot (open → keyframe → JPEG → metrics → thumbnail → S3 path `snapshots/org/site/camera/YYYY/MM/DD/HH-mm-ss-{original|thumbnail}.jpg` → Postgres metadata → close), retention jobs (originals 90 d, incident images 3 y, thumbnails 1 y), snapshot timeline UI, signed URLs. *Demo: hourly grid fills; expired snapshots pruned by retention job (short TTL in dev).*

**Stage 4 — Incidents & alerts:** Incident creation with dedup + consecutive-failure rules (Section 6.5 matrix), numbering `ANI-CAM-YYYY-XXXXXX`, lifecycle states, dependency suppression + site grouping, SES email (HTML template incl. last-healthy vs current snapshot links) + bounce webhook, WhatsApp Cloud API (3 utility templates: Critical / Site outage / Recovery) + status webhook (QUEUED→ACCEPTED→SENT→DELIVERED→READ/FAILED) + **Acknowledge button** updating the incident, escalation worker (10/20/30/60 min; ack pauses reminders but never hides the fault), maintenance windows suppress alerts, notification cooldown, alert-delivery dashboard, incident Kanban. *Demo: fault-injector kills a stream → 3 fails → incident → (mock) email+WA logged → escalation fires → recovery notice after 2 good checks.*

**Stage 5 — Image analysis:** OpenCV service endpoints returning scores for: black (mean brightness + %near-black), white/overexposed, dark/bright, blur (Laplacian variance), frozen (perceptual-hash vs previous frames + timestamp progression), obstruction (low texture / dominant color / large sudden change), **dust-on-lens (contrast drop + haze/dark-channel + spot-blob heuristics, Section 6.10)**, scene shift (ORB/SIFT feature match + SSIM vs approved reference image; UI to set/approve reference), color cast, noise. Thresholds configurable per camera; analysis results attach to snapshots; threshold breach → incident with the evidence image, score, threshold, and rule version stored. Build the **Analytics dashboard**: image-quality & dust trends per camera/zone, "Needs cleaning" list that auto-creates lens-cleaning maintenance tasks assigned to the zone engineer, before/after snapshot compare. *Demo: fault-injector serves black frames → black-image incident; serves hazy/dusty frames → dust score rises and the camera appears in "Needs cleaning" with a task created.*

**Stage 6 — Live view & wall (NEW):** Backend registers MediaMTX on-demand paths per camera (sub + main) via its API; `POST /api/cameras/:id/live/start` → validates role + session limits → returns short-lived stream JWT + WHEP/HLS URLs; MediaMTX auth webhook → our API validates the JWT; heartbeat + idle timeout with "Still watching?" prompt; session teardown removes viewer; Live Wall UI (1×1/2×2/3×2, saved layouts, per-tile status/reconnect, tile menu → detail/playback) with the `PlayerShell` compact mode (Section 6.11); single-camera HD toggle with bandwidth warning; `stream_sessions` recorded for audit + per-SIM data estimates. *Demo: 5 simulator cameras live in 3×2 wall; second HD session on same camera is refused; idle session auto-closes.*

**Stage 7 — SD playback, clips & SD health (NEW):** `CameraPlaybackAdapter` interface with three implementations — **OnvifG** (FindRecordings/GetRecordingSearchResults → GetReplayUri → RTSP with `Range: clock=` and `Scale` for speed), **Hikvision** (ISAPI search; playback `rtsp://ip:554/Streaming/tracks/101?starttime=YYYYMMDDTHHMMSSZ&endtime=...`), **Dahua/CP Plus** (`rtsp://ip:554/cam/playback?channel=1&subtype=0&starttime=YYYY_MM_DD_HH_MM_SS&endtime=...`) — *adapter is chosen per camera by the Section 6.6 detection; verify URL formats against each real camera during rollout*. On opening a date, sync that day's segments from the camera into `recording_segments` (cache). Playback: request window (≤60 min) → MediaMTX on-demand path from the playback URL → HLS to the player; seek inside window is instant, outside re-requests; speed 1×/2×/4×; full player + day TimelineScrubber per Section 6.11. Clip export: `POST /api/cameras/:id/clips {start,end≤15min}` → BullMQ FFmpeg job (`-rtsp_transport tcp -i <url> -c copy out.mp4`, transcode-to-H.264 fallback flag) → S3 → signed URL → Clips library, attachable to incidents. SD health check (hourly, via ONVIF/brand API): card present, capacity/free, recording enabled, newest segment age → alert types `SD_CARD_MISSING / SD_CARD_FULL / SD_RECORDING_STOPPED`. Simulator must fake a small recording archive so playback is demoable. *Demo: open yesterday's timeline on a sim camera, seek, change speed, export a 2-min clip, download it.*

**Stage 8 — Reports & SLA:** Daily/weekly/monthly uptime (per camera/site/zone), downtime & incident-response reports, MTTA/MTTR, repeated-fault cameras, SIM/connectivity performance, snapshot-completeness, SLA-violation report with configurable target (e.g. 99%), zone-wise image-quality & lens-cleaning report, engineer performance, audit report; PDF + Excel export; scheduled email delivery. *Demo: generate monthly report from seeded history; export both formats.*

**Stage 9 — Hardening:** Self-monitoring alerts (scheduler heartbeat, Redis/DB/S3/SES/WA failures, queue lag, workers down, snapshot jobs overdue, disk/memory, SSL expiry) + platform-health page; Prometheus metrics + Grafana dashboards; backups (pg_dump + S3 sync docs); rate limiting, helmet, session expiry; load test 125-camera schedule; the 20 mandatory failure drills from the source plan scripted where possible via fault-injector; runbook + SOP docs. *Demo: kill a worker → self-alert appears; run drill script → expected incidents fire.*

---

## 6. Authoritative feature details

### 6.1 Health pipeline (every check stores a `health_checks` row)
- **Stage 1 Router:** static IP TCP reachable, router API/mgmt port, SIM registered, signal strength, uptime, operator, WAN IP matches expected, data usage where exposed → `ROUTER_ONLINE / ROUTER_OFFLINE / SIM_DISCONNECTED / WEAK_SIGNAL / ROUTER_REBOOTED`. Use TCP checks, not ICMP-only.
- **Stage 2 Camera network:** RTSP + ONVIF ports open, responds in timeout, port-forwarding OK → `CAMERA_REACHABLE / CAMERA_PORT_CLOSED / PORT_FORWARDING_FAILURE / CAMERA_TIMEOUT`.
- **Stage 3 RTSP auth:** DESCRIBE succeeds, no 401, path unchanged → `RTSP_AUTHENTICATED / INVALID_CREDENTIALS / INVALID_STREAM_PATH / RTSP_PROTOCOL_FAILURE`.
- **Stage 4 Video validation (5–10 s):** packets arriving, frames decoding, timestamps advancing, frames changing, codec/resolution/FPS/bitrate within expected → `VIDEO_HEALTHY / NO_VIDEO_PACKETS / NO_DECODABLE_FRAMES / LOW_FPS / LOW_BITRATE / WRONG_RESOLUTION / WRONG_CODEC / UNSTABLE_STREAM`.
- **Stage 5 Image analysis:** see Stage 5 above.

**Schedule (defaults, configurable):** router TCP 1 min · RTSP port 2 min · video validation 5 min · substream snapshot 15 min · evidence snapshot + image analysis hourly · router stats 5 min · daily summary + SLA jobs. Spread across the interval; never all 125 at once.

### 6.2 Statuses
`Healthy / Warning / Critical / Maintenance / Unknown` + numeric score. Recovery requires 2 consecutive successful checks; send recovery notification with total downtime.

### 6.5 Alert rule matrix (defaults)
| Problem | Rule | Severity |
|---|---|---|
| 1 RTSP timeout | retry only | Info |
| 2 consecutive failures | dashboard warning | Warning |
| 3 consecutive failures or 5 min offline | incident + notify | Critical |
| Router offline | retry then immediate | Critical |
| Router up, camera down | camera fault | Critical |
| Invalid RTSP password | immediate config incident | Critical |
| Low FPS ×3 checks | performance | Warning |
| Black image ×2 | image failure | Critical |
| Blur ×2 hourly | maintenance | Warning |
| View shifted | tamper | Critical |
| Weak signal 15 min | connectivity | Warning |
| Snapshot overdue 30 min / none 2 h | monitoring failure | Warning / Critical |
| SD card missing/full/stopped | SD incident | Critical / Warning |
| Recovered | recovery notice | Resolved |

**Email recipients by severity:** Warning → engineer · Critical → engineer + PM · +30 min → ops head · +60 min → senior mgmt/client · site-wide → PM + network team + client authority. Subject style: `[CRITICAL] Camera CAM-042 Offline – Rohini Zone 4`.

### 6.6 Mixed-brand fleet: capability auto-detection

The 125 cameras are of **mixed / not fully known brands**. Never assume a single vendor:

- On camera registration (and via a **"Detect capabilities"** button on the camera detail page), probe ONVIF `GetDeviceInformation` (manufacturer, model, firmware, serial) and `GetServices`/`GetCapabilities`; detect **Profile G** support (Recording/Search/Replay services present).
- Store on the camera row: `brand, model, firmware, onvif_capabilities (jsonb), playback_adapter (onvif_g|hikvision|dahua|none), playback_verified (bool)`.
- **Adapter selection per camera:** Profile G present → `onvif_g`; else manufacturer matches Hikvision → `hikvision`; matches Dahua/CP Plus → `dahua`; otherwise `none` — the playback tab shows "SD playback not available for this camera" while **live view and all health checks still work** (those are brand-agnostic via RTSP/FFprobe).
- RTSP URLs are always stored **per camera** in the registry — never derived from a global brand template.
- Add a **Fleet Capability report**: cameras per brand, per adapter, playback-verified vs not — so Aniston knows exactly which of the 125 support SD playback before promising it to the client.

### 6.7 Zone hierarchy & zone-scoped RBAC

Hierarchy: **Region → Zone → Site → Camera**. Seed exactly this Delhi structure:
- **North:** Rohini, Civil Lines, Keshav Puram, Narela, Karol Bagh (CTSP)
- **South:** Central, Hauz Khas
- **West:** Rajouri Garden, Najafgarh
- **East:** Shahdara North 1, Shahdara North 2, Shahdara South 1, Shahdara South 2

Rules:
- Zones and sites are fully manageable: create/rename, set map location, enable/disable. **Moving a site to another zone or a camera to another site** updates its location/zone everywhere, open incidents follow the camera, and historical records keep the zone captured at event time (`incidents.zone_id` is snapshotted at creation). Every move requires a confirmation dialog and writes an audit entry.
- **Scoped access:** every user–role assignment has a scope — All / Region(s) / Zone(s) / Site(s) (`user_access_scopes`). Effective visibility = union of the user's scopes. An API **scope-guard middleware** filters *every* query — cameras, incidents, snapshots, live view, playback, clips, reports, notifications — by the caller's allowed zone IDs. A Rohini-scoped engineer can never see, stream, or acknowledge anything outside Rohini.
- **Zone-based alert routing:** each zone has its own recipient list (zone engineer, zone PM) and can override the escalation ladder; site-level grouping respects zone boundaries.
- Dashboards roll up Region → Zone → Site; each zone gets its own summary page (health counts, uptime, open incidents, weakest signals).

### 6.8 RTSP configuration rules & edge cases

- Per-camera config form: host/IP, port, path for main & sub, username/password as **separate fields** (workers compose the URL with URL-encoded credentials), transport TCP, expected codec/resolution/FPS/bitrate.
- **No duplicate RTSP endpoints:** store a hash of the normalized URL (lowercase host, explicit port with 554 default, trimmed trailing slash, credentials stripped) with a **DB unique constraint** per stream type. On save, reject with a clear message naming the conflicting camera. Note: cameras at one site legitimately share the same public static IP with different forwarded ports — uniqueness is on **host + port + path**, never on IP alone.
- The same URL for both main and sub of one camera → blocked with a warning.
- Validate scheme (`rtsp://` only), hostname/IP format, port range 1–65535; reject spaces and invalid characters.
- **"Test connection" before save:** runs DESCRIBE + decodes one frame, reports codec/resolution/latency inline. Saving a failing URL requires an explicit admin override (logged).
- Changing a URL or credentials → automatic re-run of capability detection (6.6) + an immediate health check; previous values kept in the audit log with credentials masked.
- Full RTSP URLs and passwords never reach the browser or logs; UI shows masked values only.
- Monitoring defaults to the **substream**; selecting the main stream for periodic checks requires an admin override with a bandwidth warning (the government servers already pull main).

### 6.9 Root-cause diagnosis (connection vs internet vs network loss)

Convert staged check results into a `diagnosis` (enum + human text) stored on camera status and on every incident, shown as a `DiagnosisBanner`:
- `SITE_INTERNET_DOWN` — router static IP unreachable → "Internet/SIM down at site"
- `SIM_SIGNAL_ISSUE` — router up but SIM disconnected or signal below threshold → "Weak or failed SIM signal"
- `NETWORK_UNSTABLE` — checks alternately pass/fail, high latency, or > X% failures in a rolling window → "Unstable network at site (packet loss)"
- `CAMERA_OFFLINE` — router online, camera port closed/timeout → "Camera not responding (power / LAN / port-forwarding)"
- `CONFIG_ERROR` — auth failure or wrong stream path → "RTSP configuration problem"
- `STREAM_DEGRADED` — connects but low FPS/bitrate/wrong codec → "Stream quality degraded"
- `IMAGE_PROBLEM` — video fine but image analysis failing → "Image problem (black / blur / dust / shifted)"

Also compute a per-camera **connection-quality score** (rolling success rate, median latency, jitter, signal strength) stored hourly, with history charts on the camera detail page, per-zone aggregates, and a "worst connections" widget on the executive dashboard.

### 6.10 Image-quality & dust analytics

- **Dust-on-lens detection (Phase 1 heuristics):** global contrast drop vs the approved reference image, haze metric (dark-channel prior), local-variance map detecting widespread soft regions, and spot/particle blob detection → combined `dust_score` 0–100 per hourly snapshot. Phase 2: small CV model classifying dust / fog / water droplets / smudge.
- **Analytics dashboard:** image-quality trend per camera and per zone; **"Needs cleaning" list** (dust or blur score above threshold for N consecutive days) that **auto-creates a lens-cleaning maintenance task** assigned to the zone engineer; before/after snapshot compare once cleaned; monthly image-quality report per zone (feeds SLA and maintenance billing).
- All scores are stored on `snapshots` so trends are queryable.

### 6.11 Professional player UI (YouTube-grade)

Build one polished `PlayerShell` component reused by Live view, Wall tiles (compact mode), and Playback:
- Custom dark control bar: play/pause, seek bar with buffered ranges + hover time tooltip + **thumbnail preview** (nearest stored snapshot to the hovered time), current/total time, speed menu (1×/2×/4×, 0.5× client-side), quality selector (Auto / Sub 360p / HD-main where permitted), Picture-in-Picture, fullscreen, settings gear; volume hidden when the stream has no audio.
- **Live mode:** red LIVE badge, latency indicator, "Go to live" button, auto-reconnect with exponential backoff and a subtle "Reconnecting…" overlay; a frozen-frame detector flips the tile into a warning state.
- **Playback mode:** the 24-hour `TimelineScrubber` under the player — recorded segments highlighted, gaps greyed, click/drag to seek, zoom to hour level, draggable clip-range handles for export.
- Keyboard shortcuts: Space play/pause, ←/→ ±10 s, ↑/↓ speed, F fullscreen, M mute; double-tap left/right ±10 s on mobile.
- Product-grade states: loading skeleton/shimmer, buffering spinner, friendly error card ("Camera unreachable — Retry / View incident"), offline placeholder showing the last snapshot.
- Base on hls.js/WHEP with fully **custom controls** (media-chrome or Vidstack as foundation is acceptable) — never default browser controls; **charcoal player chrome** per the Aniston VMS theme (doc 04 v2.0): a dark video surface inside the light UI.

---

## 7. Database tables

From the base plan: `users, roles/permissions, sites, routers, cameras, health_checks, snapshots, incidents, alert_rules, escalation_policies, notifications, maintenance_windows, audit_logs, reports`.

**New for streaming/playback:**
- `recording_segments` — id, camera_id, source(`sd_card`), track(`main|sub`), start_at, end_at, discovered_at
- `stream_sessions` — id, camera_id, user_id, kind(`live_sub|live_main|playback`), started_at, ended_at, last_heartbeat_at, client_ip, bytes_estimate
- `clip_exports` — id, camera_id, requested_by, start_at, end_at, status(`queued|processing|done|failed`), s3_key, size_bytes, error, incident_id?, created_at
- `saved_layouts` — id, user_id, name, layout(`1x1|2x2|3x2`), camera_ids jsonb
- `sd_card_status` — camera_id, present, capacity_gb, free_gb, recording_enabled, last_segment_at, checked_at
- `reference_images` — camera_id, s3_key, approved_by, approved_at (for scene-shift)
- `sim_data_usage` — router_id, period, bytes_used, budget_bytes

**New for zones, diagnosis & analytics:**
- `regions` — id, name (North/South/East/West), status
- `zones` — id, region_id, name, latitude, longitude, status · `sites` reference `zone_id`
- `user_access_scopes` — id, user_id, role, scope_type(`all|region|zone|site`), scope_id
- `zone_alert_recipients` — zone_id, severity, channel(`email|whatsapp`), recipient, escalation_level
- `maintenance_tasks` — id, camera_id, type(`lens_cleaning|repair|inspection`), source(`auto|manual`), status, assigned_to, before_snapshot_id, after_snapshot_id, created_at, completed_at
- `connection_quality_hourly` — camera_id, hour, success_rate, median_latency_ms, jitter_ms, min_signal_dbm
- `incidents` gain `zone_id` (snapshotted at creation) and `diagnosis`
- `snapshots` gain `dust_score`
- `cameras` gain `main_rtsp_hash` / `sub_rtsp_hash` (normalized, **unique** — Section 6.8)

Camera rows keep: encrypted main/sub RTSP URLs, expected codec/resolution/fps/bitrate, health_score, status, last_healthy_at, last_snapshot_at, maintenance_mode, brand, model, firmware, onvif_port, onvif_capabilities (jsonb), playback_adapter, playback_verified.

---

## 8. API surface (REST, `/api`)

Base-plan endpoints: dashboard summary; sites CRUD; cameras CRUD + `:id/check`, `:id/snapshot`, `:id/maintenance`, `:id/health-history`, `:id/snapshots`; incidents list/detail + `acknowledge/assign/resolve/close`; notifications; `alerts/test-email`, `alerts/test-whatsapp`; `webhooks/whatsapp`, `webhooks/ses`; `reports/uptime|incidents|sla`.

**New:**
- `POST /cameras/:id/live/start` (body: `quality: sub|main`) → `{sessionId, whepUrl, hlsUrl, token, expiresAt}`
- `POST /streams/sessions/:id/heartbeat` · `DELETE /streams/sessions/:id`
- `GET  /streams/sessions` (admin: active sessions per site)
- `POST /internal/media-auth` (MediaMTX auth webhook — validates stream JWT)
- `GET  /cameras/:id/recordings?date=YYYY-MM-DD` → segments timeline
- `POST /cameras/:id/playback/start` (body: `{start, end}`) → `{sessionId, hlsUrl, token}`
- `POST /cameras/:id/playback/:sessionId/seek` (body: `{start}`)
- `POST /cameras/:id/clips` · `GET /clips` · `GET /clips/:id` (signed download)
- `GET  /cameras/:id/sd-status`
- `GET/POST /layouts` (saved wall layouts)
- `GET  /routers/:id/data-usage`
- `GET/POST/PATCH /regions` · `GET/POST/PATCH /zones` · `GET /zones/:id/summary`
- `PATCH /sites/:id` (incl. `zone_id` move) · `PATCH /cameras/:id` (incl. `site_id` move)
- `POST /cameras/:id/rtsp-test` ("Test connection" before save, Section 6.8)
- `GET/POST/DELETE /users/:id/scopes` (zone-scoped access assignments)
- `GET /analytics/image-quality` · `GET /analytics/needs-cleaning` · `GET /analytics/connection-quality` (all zone-filterable)
- `GET/PATCH /maintenance-tasks`

**Every** list/detail/report endpoint is filtered through the scope-guard middleware by the caller's allowed zones (Section 6.7).

---

## 9. Definition of done (every stage)

`docker compose up -d` → healthy; `pnpm lint && pnpm typecheck && pnpm build` clean; unit tests for rules engine, scoring, escalation timing, and playback adapters (mocked); seed + simulator make the stage demoable end-to-end; `docs/PROGRESS.md` updated with demo steps; no secrets committed.

---

## 10. Assumptions to confirm with me after Phase 0

1. **Camera brand/model?** — **Answered: mixed / not fully known.** So: ONVIF-first design with per-camera auto-detection (Section 6.6); brand adapters are per-camera fallbacks. Only ask me again if a specific camera fails detection.
2. Do the cameras support **ONVIF Profile G** (SD replay) — and does the SD record **main, sub, or both**?
3. Router model + is a **management API** available for signal/data stats (or Airtel portal only)?
4. Expected concurrent dashboard viewers, and monthly **data budget per SIM**?
5. Production server specs + domain (e.g. `monitoring.anistonav.com`)?
6. WhatsApp Business + SES accounts ready, or should alerts run in mock mode first?

Until answered: alerts run in mock mode (logged, not sent); no global camera-brand default — detect per camera, and if detection fails, mark that camera's playback "unverified" while health monitoring continues normally.

---

**Begin now with Phase 0.**
