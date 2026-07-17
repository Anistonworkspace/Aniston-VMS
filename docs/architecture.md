# System Architecture — Aniston VMS

> Source of truth: [`02-TRD.md`](02-TRD.md) (design) and [`05-backend-schema.md`](05-backend-schema.md)
> (data model). This doc is the working summary. Harness entry point: [`.claude/GUIDE.md`](../.claude/GUIDE.md).

## High-level overview

```mermaid
graph TB
    subgraph Field ["Camera fleet (SIM routers, public static IPs)"]
        CAM[IP Cameras<br/>RTSP + ONVIF + SD card]
        RTR[4G SIM Routers]
        CAM --- RTR
    end

    subgraph Clients
        WEB[Browser SPA<br/>React + Vite + RTK Query]
    end

    subgraph Edge
        NGX[Nginx<br/>HTTPS · SPA fallback · WS upgrade]
    end

    subgraph Backend [":4000"]
        EXP[Express API<br/>auth · scope guard · modules]
        WRK[BullMQ Workers<br/>health probes · snapshots · notifications · clips]
        AN[Python OpenCV<br/>image-analysis service]
    end

    subgraph Media
        MTX[MediaMTX<br/>on-demand RTSP pull → WHEP / HLS]
    end

    subgraph Data
        PG[(PostgreSQL 16)]
        RD[(Redis 7<br/>cache · queues)]
        S3[(S3-compatible storage<br/>snapshots · clips)]
    end

    WEB -->|HTTPS /api/*| NGX --> EXP
    WEB -->|WHEP / HLS| MTX
    MTX -->|POST /internal/media-auth| EXP
    MTX -->|RTSP pull| RTR
    WRK -->|RTSP/ONVIF/TCP probes| RTR
    WRK --> AN
    EXP --> PG & RD
    WRK --> PG & RD & S3
    WRK -->|WhatsApp Cloud API / AWS SES| NOTIF[Recipients]
```

## Streaming path (live)

From `02-TRD.md`:

> Flow: `POST /cameras/:id/live/start` → scope + session-limit checks → create `stream_sessions`
> row → short-lived stream JWT → client plays WHEP (`/{path}/whep`) or HLS (`/{path}/index.m3u8`)
> → MediaMTX calls our `POST /internal/media-auth` webhook to validate the JWT per connection.

```mermaid
sequenceDiagram
    participant C as Client (Live Wall)
    participant API as Express API
    participant M as MediaMTX
    participant CAM as Camera (RTSP)

    C->>API: POST /cameras/:id/live/start
    API->>API: scope + session-limit checks
    API->>API: create stream_sessions row, sign stream JWT
    API-->>C: mediamtx path + stream JWT
    C->>M: WHEP /{path}/whep (or HLS /{path}/index.m3u8)
    M->>API: POST /internal/media-auth (validate JWT)
    API-->>M: allow
    M->>CAM: on-demand RTSP pull (sub/main stream)
    M-->>C: WebRTC / HLS media
```

Playback follows the same session/auth model, with per-brand `PlaybackAdapter`s
(`ONVIF_G | HIKVISION | DAHUA | NONE`) reading SD-card recordings; discovered segments are
indexed in `recording_segments`, exports go through `clip_exports`.

## Health-check pipeline

```mermaid
graph LR
    SCH[BullMQ schedulers] --> P[Probe workers<br/>FFprobe / TCP / ONVIF]
    P -->|RTSP_AUTH · RTSP_PORT · ROUTER_TCP| HC[(health_checks)]
    P -->|snapshots| S3[(snapshots + scores)]
    S3 --> CV[OpenCV analysis<br/>IMAGE_ANALYSIS · VIDEO_VALIDATION]
    HC --> ROLL[(connection_quality_hourly)]
    HC & CV --> DIAG[Diagnosis engine<br/>health score + Diagnosis enum]
    DIAG -->|alert_rules: consecutive_failures,<br/>cooldown_minutes| INC[(incidents)]
```

- Check types (`CheckType`): `RTSP_AUTH`, `RTSP_PORT`, `ROUTER_TCP`, `IMAGE_ANALYSIS`, `VIDEO_VALIDATION`.
- Snapshot scoring: brightness / blur / freeze / obstruction / scene-shift (see `05-backend-schema.md § Monitoring`).
- Diagnosis (`Diagnosis`): e.g. `SITE_INTERNET_DOWN`, `SIM_SIGNAL_ISSUE`, `NETWORK_UNSTABLE`,
  `CAMERA_OFFLINE`, `STREAM_DEGRADED`, `IMAGE_PROBLEM`, `CONFIG_ERROR`.
- Camera state: `CameraStatus` + `health_score` on `cameras`, rolled up to site/zone/region dashboards.

## Incident & notification pipeline

```mermaid
graph LR
    INC[(incidents)] --> EV[(incident_events<br/>full timeline)]
    INC --> ESC[escalation_policies<br/>+ escalation_steps<br/>after_minutes · recipient_level]
    ESC --> REC[zone_alert_recipients]
    REC --> N[(notifications)]
    N -->|WhatsApp Cloud API| WA[WhatsApp]
    N -->|AWS SES| MAIL[Email]
    WA & MAIL -->|delivery webhooks| N
```

- Incident lifecycle (`IncidentStatus`): `DETECTED → CONFIRMED → ALERTED → ACKNOWLEDGED →
  ASSIGNED → INVESTIGATING → …` (terminal states incl. resolution/recovery verification — see schema doc).
- Delivery tracking (`NotificationStatus`): `QUEUED | ACCEPTED | SENT | DELIVERED | READ | BOUNCED | FAILED`.
- Maintenance: `maintenance_windows` suppress alerts; `maintenance_tasks`
  (`TaskType`/`TaskSource`/`TaskStatus`) track field work like lens cleaning.

## Authentication & scoping

- JWT **access + refresh** (access short-lived in `Authorization` header, refresh in httpOnly
  cookie), MFA (TOTP) for admins, session expiry, login rate limiting (per `02-TRD.md § Security`).
- RTSP credentials stored **AES-256-GCM encrypted** (`rtsp_url_enc`, …); key from env; decrypted
  only in workers; masked everywhere in UI/API.
- **Access scoping** — every user carries `user_access_scopes` rows
  (`scope_type: ALL | REGION | ZONE | SITE`). Every query on hierarchy-scoped data must be
  filtered through the scope guard (this is the VMS application of the harness rule
  `rule-security-rbac.md`; roles: `SUPER_ADMIN`, `PROJECT_ADMIN`, … `CLIENT_VIEWER` — full enum in
  `05-backend-schema.md`).
- `audit_logs` row on every mutation.

## Request lifecycle (API)

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as Middleware chain
    participant CTL as Controller
    participant SVC as Service
    participant DB as Prisma → Postgres

    C->>MW: PATCH /api/cameras/:id
    MW->>MW: authenticate (JWT)
    MW->>MW: requirePermission + scope guard
    MW->>MW: validateRequest (Zod)
    MW->>CTL: req.body + req.user
    CTL->>SVC: CameraService.update(dto, user scopes)
    SVC->>DB: prisma.$transaction([update, audit_logs])
    CTL-->>C: 200 { success: true, data: camera }
```

## Job & retention architecture

Queues/workers (BullMQ on Redis): health probes, snapshot capture + analysis, notification
dispatch, clip export, segment discovery. Nightly workers (per `05-backend-schema.md § Retention & jobs`):
prune `snapshots` per policy (skip incident-linked), expire `recording_segments` cache > 35 d,
close stale `stream_sessions`, roll `connection_quality_hourly`; S3 lifecycle rules mirror DB policy.
