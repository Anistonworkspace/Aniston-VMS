# Skill — System Design Patterns

Templates for every section of a system-design document, worked through
using Aniston VMS's own architecture as the running example. Used by
`agent-system-designer` to produce `memory/decisions/ADR-*-system-design-*.md`,
`docs/prd-*.md`, and `docs/erd-*.md`.

Rule: every section stays under 30 lines. Long specs rot faster than they
inform.

---

## Section 1 — Context

*What problem, for whom, why now.*

> Aniston VMS operators currently learn a camera is down when a client
> calls angry. This system continuously health-checks every camera across
> every site, diagnoses *why* it's down (not just *that* it's down), opens
> an incident, escalates through WhatsApp/email on a fixed ladder, and
> tracks the fix through to a verified recovery — before the client
> notices.

---

## Section 2 — Requirements (functional)

*Bulleted, testable, no design decisions yet.*

- Probe every camera's health on a repeating cycle covering all cameras
  within 5 minutes, jittered so probes don't burst.
- Diagnose one of `SITE_INTERNET_DOWN | SIM_SIGNAL_ISSUE | NETWORK_UNSTABLE
  | CAMERA_OFFLINE | CONFIG_ERROR | STREAM_DEGRADED | IMAGE_PROBLEM`.
- Open an `Incident` (`ANI-CAM-2026-000145`-style number), escalate on a
  0/10/20/30/60-minute ladder until acknowledged.
- Live view (low-bitrate substream by default) and ≤ 60-minute SD-card
  playback windows per camera.
- Role-scoped access by region/site/zone (`SUPER_ADMIN` through
  `CLIENT_VIEWER`), full audit log of every state-changing action.

---

## Section 3 — Non-functional requirements

*Numbers, not adjectives.*

| Requirement | Target |
|---|---|
| Health-cycle coverage | All ~125 cameras probed within 5 min, ≈ 25/min jittered spread |
| Snapshot storage growth | ≈ 1.5 GB/day/site, lifecycle-purged per retention policy |
| Notification delivery | WhatsApp/email dispatched within 60s of an escalation step firing |
| Playback window | ≤ 60 min per request, adapter-dependent scrub support |
| Secrets at rest | RTSP credentials, refresh tokens: AES-256-GCM |
| Access control | Deny-by-default; every query scoped by resolved region/site/zone, never trust a client-supplied ID alone |

---

## Section 4 — Stack decision

*Pick, justify in one line, move on — this is a decision record, not a
tutorial.*

| Layer | Choice | Why |
|---|---|---|
| API | NestJS (`apps/api`) | Structured DI, guards/pipes map cleanly onto scope+role auth |
| DB | PostgreSQL + Prisma | Relational fits the region→site→zone→camera hierarchy; migrations reviewable |
| Queue | BullMQ (`apps/workers`) + Redis | Native repeatable/jittered jobs for the health-probe cycle |
| Media | MediaMTX | On-demand RTSP→WebRTC/HLS, avoids always-on transcoding for idle cameras |
| Image analysis | Python/FastAPI + OpenCV | Vision libraries live in Python, isolated as its own service so a crash there can't take down the API |
| Shared types | `packages/shared` (`@aniston-vms/shared`) | One source of truth for enums (`CameraStatus`, `IncidentStatus`, …) across API, workers, frontend |

---

## Section 5 — Architecture diagram

```
                        ┌────────────────────┐
   Frontend (React) ───▶│   apps/api (Nest)  │◀── ScopeGuard / RolesGuard
                        └─────────┬──────────┘
                                  │ enqueue
                    ┌─────────────┼─────────────┬───────────────┐
                    ▼             ▼              ▼               ▼
             health-probe     snapshot     image-analysis   notifications
              (BullMQ)        (BullMQ)     → services/image-analysis (FastAPI)
                    │             │              │               │
                    ▼             ▼              ▼               ▼
                          PostgreSQL (Prisma) ── shared source of truth
                                  │
                                  ▼
                          services/media (MediaMTX) ── RTSP → WebRTC/HLS
```

Each box on the second row is a queue defined in
`skill-workflow-orchestration-patterns.md`; `services/media` and
`services/image-analysis` are the only genuinely separate deployables —
everything inside `apps/api` is a bounded context/module
(`skill-ddd-bounded-contexts-patterns.md`), not a microservice.

---

## Section 6 — Data model summary

*One line per entity, not the full schema — link to `docs/erd-*.md` for
that.*

`Region 1―* Site 1―* Zone 1―* Camera *―1 Router`, `Camera 1―* HealthCheck`,
`Camera 1―* Incident 1―* IncidentEvent`, `Incident *―1 EscalationPolicy`,
`Incident 1―* Notification`, `Camera 1―* StreamSession`, `Camera 1―*
ClipExport`, `User *―* Zone` (via `UserAccessScope`), `User 1―*
AuditLog`.

---

## Section 7 — API sketch

*Method + path + one-line purpose, group by bounded context.*

```
GET   /cameras                       # Monitoring/Health — scoped list
GET   /incidents?status=ALERTED      # Incidents — scoped list
PATCH /incidents/:id/acknowledge     # Incidents — state transition
POST  /cameras/:id/live/start        # Streaming — MediaMTX on-demand session
GET   /cameras/:id/clips             # Streaming — SD playback / exported clips
GET   /reports/uptime?zoneId=…       # Reporting — read-only rollup
```

---

## Section 8 — Rollout plan

*Stages, each independently shippable and demoable.*

1. Monitoring/Health: inventory CRUD + health-probe queue + connection-quality scoring.
2. Incidents: diagnosis engine + state machine + escalation ladder (no notifications yet — log only).
3. Notifications: WhatsApp/email delivery, delivery-status webhooks.
4. Streaming/Playback: live view, SD playback adapters, clip export.
5. Reporting: uptime/SLA rollups, exports.
6. Hardening: rate limits, retention/lifecycle jobs, audit-log completeness pass.

---

## Section 9 — Consequences / risks

*What we're accepting, not solving today.*

- On-demand MediaMTX sessions mean the *first* viewer of an idle camera
  pays a few hundred ms of stream-startup latency — accepted for the
  bandwidth savings.
- A modular monolith (`apps/api`) means a bug in one context's dependency
  can still crash the whole API process — mitigated by, not eliminated by,
  bounded-context module boundaries; genuine isolation only exists at the
  `services/media` / `services/image-analysis` process boundary.
- Escalation ladder is fixed per zone at policy-creation time; mid-incident
  policy edits do not retroactively reschedule an already-queued step.
