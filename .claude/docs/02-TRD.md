# Aniston VMS — Technical Requirements Document (TRD)

**Doc version: v1.0 · 17 July 2026 · Built for plan v1.3**

---

## 1. Architecture

```
125 Cameras + SIM Routers (public static IPs)
        │  RTSP/TCP · ONVIF · Router API          ┌─ Government Server 1 (main stream)
        │                                          └─ Government Server 2 (main stream)
        ▼
┌────────────────────────────  Aniston VMS  ────────────────────────────┐
│  MediaMTX (on-demand RTSP → WebRTC/HLS)   Probe workers (FFprobe)     │
│  Scheduler → BullMQ queues → Snapshot / Analysis / Notify / Escalate  │
│  NestJS API (scope guard, incidents, streaming, playback, reports)    │
│  Python OpenCV analysis service                                       │
└────────────┬─────────────────┬─────────────────┬─────────────────────┘
             ▼                 ▼                 ▼
        PostgreSQL 16      Redis 7          S3 / MinIO
             │
             ▼
   React (Vite + Tailwind + shadcn) — Nginx — Prometheus/Grafana
```

Monorepo (pnpm): `apps/api` (NestJS + Prisma), `apps/web` (React), `apps/workers` (BullMQ), `services/image-analysis` (FastAPI + OpenCV), `services/media` (MediaMTX), `tools/camera-simulator`, `tools/fault-injector`, `infra/`, `docker-compose.yml`.

## 2. Health-check pipeline

| Stage | Checks | Result codes |
|---|---|---|
| 1 Router | static-IP TCP, mgmt port, router API, SIM registered, signal, uptime, WAN-IP match, data usage | ROUTER_ONLINE, ROUTER_OFFLINE, SIM_DISCONNECTED, WEAK_SIGNAL, ROUTER_REBOOTED |
| 2 Camera network | RTSP + ONVIF ports open, timeout, port-forwarding | CAMERA_REACHABLE, CAMERA_PORT_CLOSED, PORT_FORWARDING_FAILURE, CAMERA_TIMEOUT |
| 3 RTSP auth | DESCRIBE succeeds, no 401, path valid | RTSP_AUTHENTICATED, INVALID_CREDENTIALS, INVALID_STREAM_PATH, RTSP_PROTOCOL_FAILURE |
| 4 Video (5–10 s) | packets, decodable frames, timestamps advancing, frames changing, codec/res/FPS/bitrate in range | VIDEO_HEALTHY, NO_VIDEO_PACKETS, NO_DECODABLE_FRAMES, LOW_FPS, LOW_BITRATE, WRONG_RESOLUTION, WRONG_CODEC, UNSTABLE_STREAM |
| 5 Image | see analysis service | per-metric scores |

Use TCP checks, never ICMP-only. All probes use `-rtsp_transport tcp`.

**Schedule (defaults):** router TCP 1 min · RTSP port 2 min · video validation 5 min · substream snapshot 15 min · evidence snapshot + analysis hourly · router stats 5 min · daily summary + SLA jobs. **Jittered spreading:** never all 125 at once (~25 cameras/min inside a 5-min cycle).

**Scoring:** Router 20 + RTSP 25 + Video 25 + Image 20 + Config 10 = 100. 90+ Healthy · 75–89 Warning · 50–74 Major warning · <50 Critical. Any critical condition overrides.

## 3. Root-cause diagnosis engine

Map staged results to `diagnosis` (stored on camera status + every incident):

| Condition | diagnosis | Human text |
|---|---|---|
| Router IP unreachable | SITE_INTERNET_DOWN | Internet/SIM down at site |
| Router up, SIM off / signal < threshold | SIM_SIGNAL_ISSUE | Weak or failed SIM signal |
| Alternating pass/fail, latency high, >X% fails in window | NETWORK_UNSTABLE | Unstable network (packet loss) |
| Router up, camera port closed/timeout | CAMERA_OFFLINE | Camera not responding (power/LAN/port-forward) |
| 401 / bad path | CONFIG_ERROR | RTSP configuration problem |
| Connects, low FPS/bitrate/wrong codec | STREAM_DEGRADED | Stream quality degraded |
| Video OK, image metric failing | IMAGE_PROBLEM | Image problem (black/blur/dust/shifted) |

**Connection-quality score** per camera, rolled up hourly: weighted (success-rate 40%, median latency 20%, jitter 15%, signal 25%); history charts + per-zone aggregates + "worst connections" widget.

## 4. False-alert prevention & alert rules

Retry immediately on failure → require consecutive failures (default 3, or 5 min offline) → hysteresis → recovery needs 2 consecutive successes → maintenance windows suppress → **dependency suppression** (router incident inhibits its cameras' incidents) → site grouping (one alert for multi-camera site failure) → notification cooldown → escalation only while unresolved. Full rule matrix lives in the master prompt §6.5 and is seeded into `alert_rules`.

## 5. Streaming (live view)

- MediaMTX paths registered per camera (sub + main) via its HTTP API with `sourceOnDemand: true` — MediaMTX connects to the camera only while a viewer is attached and drops it after.
- Flow: `POST /cameras/:id/live/start` → scope + session-limit checks → create `stream_sessions` row → short-lived stream JWT → client plays WHEP (`/{path}/whep`) or HLS (`/{path}/index.m3u8`) → MediaMTX calls our `POST /internal/media-auth` webhook to validate the JWT per connection.
- Guardrails: grid = substream only; ≤1 concurrent HD-live/playback per camera; ≤3 (config) streaming sessions per site; heartbeat every 30 s; idle 10 min → "Still watching?" → teardown; per-SIM byte estimates recorded to `sim_data_usage`.

## 6. SD-card playback

- `CameraPlaybackAdapter` interface: `listSegments(day)`, `getPlaybackUrl(start,end)`, `supportsScale()`. Implementations chosen **per camera** from capability detection: **OnvifG** (FindRecordings → GetRecordingSearchResults → GetReplayUri; RTSP `Range: clock=…` + `Scale` for speed) · **Hikvision** (`rtsp://host:554/Streaming/tracks/101?starttime=YYYYMMDDTHHMMSSZ&endtime=…`) · **Dahua/CP Plus** (`rtsp://host:554/cam/playback?channel=1&subtype=0&starttime=YYYY_MM_DD_HH_MM_SS&endtime=…`). Verify formats against real cameras at rollout; `none` → playback UI disabled for that camera.
- Opening a date syncs that day's segments from the camera into `recording_segments` (cache). Playback window ≤60 min → MediaMTX on-demand path from the playback URL → HLS. Seek inside window is instant; outside re-requests. Speed via RTSP Scale where supported, else client-side.
- **Clip export:** range ≤15 min → BullMQ job → `ffmpeg -rtsp_transport tcp -i <url> -c copy out.mp4` (H.264 transcode fallback flag) → S3 → signed URL; attachable to incidents.
- **SD health (hourly):** via ONVIF/brand API — present, capacity/free, recording enabled, newest-segment age → `SD_CARD_MISSING / SD_CARD_FULL / SD_RECORDING_STOPPED` incidents.

## 7. RTSP configuration rules

Normalize (lowercase host, explicit port default 554, trim trailing slash, strip credentials) → SHA-256 hash → **unique per stream type** in DB; rejection names the conflicting camera. Uniqueness is host+port+path (same public IP with different forwarded ports is legal). Same URL for main and sub blocked. Scheme `rtsp://` only; port 1–65535. "Test connection" runs DESCRIBE + decodes one frame, returns codec/res/latency; saving a failing URL needs an admin override (logged). URL/credential change → re-run capability detection + immediate health check; audit keeps masked history. Credentials URL-encoded when composing; never logged or sent to the browser. Monitoring defaults to substream; main-stream monitoring needs admin override + bandwidth warning.

## 8. Zone scope guard

Middleware resolves the caller's allowed zone IDs (union of `user_access_scopes`, expanding region→zones, zone→sites) once per request and injects `where: { zone_id: { in: allowed } }` (or via site/camera join) into **every** Prisma query — lists, details, snapshots, streams, playback, clips, notifications, reports. Streaming/playback token issuance re-checks scope. Deny-by-default.

## 9. Image-analysis service contract

`POST /analyze` `{image_url|bytes, camera_id, reference_url?}` → `{brightness, darkness, blur, freeze, obstruction, scene_shift, color_cast, noise, dust, overall}` each 0–100 + booleans vs thresholds. Dust (Phase 1): contrast drop vs reference, dark-channel haze metric, local-variance softness map, spot/blob count. `POST /compare` for freeze/shift. Model/rule versions returned and stored. Phase 2 adds a small CV classifier (dust/fog/droplets/smudge).

## 10. Storage & retention

Snapshots ≈ 125 × 24 × ~500 KB ≈ 1.5 GB/day. S3 layout `snapshots/org/site/camera/YYYY/MM/DD/HH-mm-ss-{original|thumbnail}.jpg`. Lifecycle: originals 90 d, incident-linked 3 y (deletion-protected while incident retained), thumbnails 1 y, clips 1 y (configurable), temp frames 7 d. SD 128 GB ≈ **5–6 days** @1080p/2 Mbps or **~6 weeks** @256 Kbps sub — confirm what the SD records.

## 11. Security

AES-256-GCM encryption of RTSP credentials (key from env; decrypt only in workers), masked everywhere, per-camera passwords, rotation supported. JWT access+refresh, RBAC+scopes, MFA (TOTP) for admins, session expiry, login rate limiting. HTTPS only; signed temporary URLs for snapshots/clips; camera/router ports allow-listed to the two government IPs + VMS IP; audit log on every mutation; encrypted backups; separate prod/test envs.

## 12. Self-monitoring & metrics

Internal alerts: scheduler heartbeat missed, Redis/DB/S3/SES/WhatsApp failures, queue lag, worker crash, snapshot jobs overdue, too many cameras unchecked, disk/memory high, SSL expiry. Prometheus metrics from API/workers (check durations, queue depth, failures, active sessions); Grafana dashboards; platform-health page (heartbeat age, pending checks, oldest job, active workers, failed jobs/h).

## 13. Performance & scaling

Steady state ≈ 2–4 probe checks/s across 125 cameras — 2 probe workers + 1 analysis worker suffice initially. Workers stateless → scale by adding containers. Partition `health_checks` monthly; index hot paths (`camera_id, started_at`). Targets: API p95 <300 ms; dashboard <2 s; live start <5 s; playback start <8 s.
