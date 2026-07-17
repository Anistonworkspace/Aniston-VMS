# Glossary — Aniston VMS

Project-specific terms. Update when introducing new domain concepts.
Authoritative definitions: `docs/01-PRD.md`, `docs/02-TRD.md`, `docs/05-backend-schema.md`.

## Roles (enum `Role` — full list in docs/05-backend-schema.md § Enums)

- **SUPER_ADMIN** — full platform access across all regions/tenants.
- **PROJECT_ADMIN** — administers a project/deployment scope.
- **CLIENT_VIEWER** — read-only client access to their scoped cameras/dashboards.

## Hierarchy & tenancy

- **Region → Zone → Site → Camera** — the VMS hierarchy (`regions`, `zones`, `sites`, `cameras`).
  "Org" in harness rules maps to this hierarchy in Aniston VMS.
- **Scope / user_access_scopes** — per-user access grants (`ScopeType: ALL | REGION | ZONE | SITE`).
  Every query on hierarchy-scoped data must be filtered by the caller's scopes (IDOR rule).
- **Site** — physical location under a zone; holds routers + cameras.
- **Zone** — administrative grouping of sites within a region (seeded: Delhi structure, 13 zones).
- **SIM router** — 4G router (`routers`: `sim_number`, `operator`, `public_static_ip`) connecting
  field cameras to the VMS over public static IPs.

## Streaming

- **RTSP** — camera-side stream protocol; MediaMTX pulls RTSP on demand. Credentials stored
  AES-256-GCM encrypted (`*_enc` columns), decrypted only in workers.
- **MediaMTX** — media server; republishes camera RTSP as WHEP/HLS; authenticates every viewer
  connection via `POST /internal/media-auth`.
- **WHEP** — WebRTC-HTTP Egress Protocol; primary low-latency live playback (`/{path}/whep`).
- **HLS** — HTTP Live Streaming fallback (`/{path}/index.m3u8`).
- **Stream session** — `stream_sessions` row + short-lived stream JWT created by
  `POST /cameras/:id/live/start`; kinds: `LIVE_SUB | LIVE_MAIN | PLAYBACK`.
- **Playback adapter** — per-brand SD-card playback integration (`ONVIF_G` = ONVIF Profile G,
  `HIKVISION`, `DAHUA`, `NONE`).
- **Segment** — a discovered SD-card recording span (`recording_segments`: track `MAIN|SUB`,
  `start_at`–`end_at`).
- **Clip** — user-requested export of a recording range (`clip_exports`,
  `ClipStatus: QUEUED | PROCESSING | DONE | FAILED`).
- **Saved layout** — a user's live-wall grid (`saved_layouts`, `LayoutKind`).

## Health & incidents

- **Health check** — scheduled probe result (`health_checks`,
  `CheckType: RTSP_AUTH | RTSP_PORT | ROUTER_TCP | IMAGE_ANALYSIS | VIDEO_VALIDATION`).
- **Health score** — per-camera rollup on `cameras.health_score`; hourly aggregates in
  `connection_quality_hourly`.
- **Diagnosis** — machine-determined root cause (`Diagnosis`: `SITE_INTERNET_DOWN`,
  `SIM_SIGNAL_ISSUE`, `NETWORK_UNSTABLE`, `CAMERA_OFFLINE`, `STREAM_DEGRADED`, `IMAGE_PROBLEM`,
  `CONFIG_ERROR`, …).
- **Snapshot** — captured frame + quality scores (brightness/blur/freeze/obstruction/scene-shift);
  compared against approved `reference_images`.
- **Incident** — tracked outage/problem (`incidents`, number format `ANI-CAM-2026-000145`);
  kanban lifecycle `IncidentStatus: DETECTED → CONFIRMED → ALERTED → ACKNOWLEDGED → ASSIGNED →
  INVESTIGATING → …`; full timeline in `incident_events`.
- **Escalation** — timed notification laddering: `alert_rules` →
  `escalation_policies`/`escalation_steps` (`after_minutes`, `recipient_level`) →
  `zone_alert_recipients`.
- **Notification** — WhatsApp Cloud API / AWS SES message with delivery tracking
  (`NotificationStatus: QUEUED | ACCEPTED | SENT | DELIVERED | READ | BOUNCED | FAILED`).
- **Maintenance window** — alert-suppression period (`maintenance_windows`).
- **Maintenance task** — field work item (`maintenance_tasks`, e.g. `LENS_CLEANING`;
  source `AUTO | MANUAL`).

## Security terms (harness)

- **AppError** — typed error hierarchy in `backend/src/middleware/errorHandler.ts`.
- **Encrypted fields** — AES-256-GCM via `backend/src/utils/encryption.ts`; VMS schema uses the
  `_enc` suffix (e.g. `rtsp_url_enc`).
- **httpOnly cookie** — refresh tokens live here; access tokens are short-lived, in memory only.
- **Audit log** — `audit_logs` row on every mutation (who/what/before/after/IP).

## Memory / coordination terms (this directory)

- **Plan** — a written outline of an upcoming change, stored in `memory/plans/_active/` before
  execution begins. Required for any non-trivial work.
- **Lock** — a registered claim on files, recorded in `memory/coordination/locks.md`.
- **Handoff** — a task transfer between agents, recorded in `memory/coordination/handoffs.md`.
- **Shared context** — cross-agent learnings in `memory/coordination/shared-context.md`.
- **ADR** — Architectural Decision Record, numbered files in `memory/decisions/`.
