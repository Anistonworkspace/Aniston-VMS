# Aniston VMS — App Flow

**Doc version: v1.1 · 18 July 2026 · Built for plan v1.5**

---

## 1. Role journeys (summary)

- **Monitoring Operator (zone-scoped):** Login → zone dashboard → sees Warning/Critical cards → opens incident → reads diagnosis banner ("Internet/SIM down at site") → acknowledges → watches live to confirm → adds note.
- **Maintenance Engineer:** WhatsApp alert → taps **Acknowledge** → opens incident on mobile → visits site → resolves → platform auto-verifies recovery (2 good checks) → recovery notification → downtime recorded.
- **Project Admin:** Creates a new site under Rohini → registers router + cameras → RTSP "Test connection" → capability auto-detected → cameras go live in monitoring within one cycle.
- **Client Viewer:** Read-only zone dashboard → monthly uptime & SLA report → snapshot evidence.

## 2. Health check → incident

```mermaid
flowchart TD
  S[Scheduler tick] --> R{Router TCP OK?}
  R -- no --> RD[diagnosis: SITE_INTERNET_DOWN] --> C1{3 consecutive fails?}
  R -- yes --> P{Camera port open?}
  P -- no --> PD[diagnosis: CAMERA_OFFLINE] --> C1
  P -- yes --> A{RTSP auth OK?}
  A -- no --> AD[diagnosis: CONFIG_ERROR] --> C1
  A -- yes --> V{Video valid?}
  V -- no --> VD[diagnosis: STREAM_DEGRADED] --> C1
  V -- yes --> H[Update score/status Healthy]
  C1 -- no --> RET[Retry, dashboard warning at 2]
  C1 -- yes --> SUP{Router/site incident open?}
  SUP -- yes --> INH[Suppress camera incident - group under site]
  SUP -- no --> INC[Create incident ANI-CAM-YYYY-NNNNNN] --> NOT[Email + WhatsApp] --> ESC[Escalation timer]
```

## 3. Incident lifecycle

```mermaid
stateDiagram-v2
  [*] --> Detected
  Detected --> Confirmed: threshold met
  Confirmed --> Alerted: notifications sent
  Alerted --> Acknowledged: user/WhatsApp button
  Acknowledged --> Assigned
  Assigned --> Investigating
  Investigating --> Resolved: engineer fixes
  Alerted --> Resolved: camera self-recovers
  Resolved --> RecoveryVerified: 2 consecutive good checks
  RecoveryVerified --> Closed: recovery notice + downtime + SLA calc
  Closed --> [*]
```

Escalation while unresolved: **0 min** engineer → **10** reminder → **20** PM → **30** ops head → **60** senior mgmt/client. Ack pauses reminders (policy-dependent) but the fault stays visible; escalation stops on recovery, maintenance mode, merge into site outage, or authorized closure.

## 4. Live view session

```mermaid
sequenceDiagram
  participant U as User (browser)
  participant API as VMS API
  participant M as MediaMTX
  participant C as Camera
  U->>API: POST /cameras/42/live/start (sub)
  API->>API: scope guard + session limits
  API-->>U: {whepUrl, hlsUrl, token}
  U->>M: WHEP connect + token
  M->>API: POST /internal/media-auth (token)
  API-->>M: allow
  M->>C: open RTSP substream (on demand)
  C-->>M: video
  M-->>U: WebRTC stream
  loop every 30s
    U->>API: heartbeat
  end
  Note over U,API: idle 10 min → "Still watching?" → no reply → teardown
  U->>API: DELETE session → M drops camera connection
```

Wall = 4–6 parallel substream sessions (2×2 / 3×2), each tile its own session with auto-reconnect.

## 5. Playback + clip export

```mermaid
sequenceDiagram
  participant U as User
  participant API as VMS API
  participant AD as Playback adapter
  participant C as Camera SD
  participant M as MediaMTX
  U->>API: GET /cameras/42/recordings?date=2026-07-16
  API->>AD: listSegments(day)
  AD->>C: ONVIF-G / ISAPI / Dahua query
  C-->>API: segments → cache recording_segments
  API-->>U: timeline data
  U->>API: POST playback/start {10:00,10:45}
  API->>M: register on-demand path (playback URL)
  M->>C: RTSP replay pull
  API-->>U: hlsUrl + token → player plays, seek in window instant
  U->>API: POST /cameras/42/clips {10:12,10:19}
  API->>API: BullMQ ffmpeg job → MP4 → S3
  API-->>U: clip ready (signed URL, attach to incident)
```

## 6. WhatsApp acknowledge

```mermaid
flowchart LR
  I[Incident confirmed] --> T[Template send via Cloud API]
  T --> W[Webhook: sent/delivered/read] --> L[notifications log]
  W --> B{Engineer taps Acknowledge}
  B --> U[Incident → Acknowledged, assignee set]
  U --> P[Escalation reminders paused]
```

Read receipts never auto-resolve incidents.

## 7. RTSP save with validation

```mermaid
flowchart TD
  F[Config form] --> V{Format valid?}
  V -- no --> E1[Inline error]
  V -- yes --> D{Duplicate hash?}
  D -- yes --> E2[Reject - name conflicting camera]
  D -- no --> T[Test connection: DESCRIBE + 1 frame]
  T -- fail --> O{Admin override?}
  O -- no --> E3[Not saved]
  O -- yes --> S[Save + audit override]
  T -- pass --> S2[Save] --> CAP[Re-run capability detection] --> HC[Immediate health check]
```

## 8. Zone / camera move

Select camera → "Move to…" (zone→site picker, scope-checked) → confirmation dialog showing impact (location, alert routing, open incidents follow) → audit entry → dashboards, wall layouts, and reports reflect the new zone immediately; historical incidents keep their original `zone_id`.

## 9. Live ⇄ Snapshot toggle (permission-gated)

```mermaid
flowchart TD
  H[Live Wall focus header] --> Tg{Toggle: Live / Snapshots}
  Tg -- Live --> Perm{LIVE_VIEW permission?}
  Perm -- no --> Lock[Lock icon + Ask your administrator - Live disabled, Snapshots still works]
  Perm -- yes --> LiveView[Live substream session - see section 4]
  Tg -- Snapshots --> Snap[Big selected snapshot]
  Snap --> Film[24h filmstrip at camera capture interval]
  Snap --> Nav[Date navigation: arrows/calendar - browse previous days]
  Tile[Right-side camera tile clicked] --> H
  Zone[Zone filter - scope-aware] --> H
```

Note (v1.5 shell): topbar is reduced to notification bell + "Open Live Wall" button; the Live/Snapshots toggle and zone filter live in the focus header itself, not the topbar.

## 10. Add-camera modal flow

```mermaid
flowchart TD
  E[Entry: Cameras page / Settings-Cameras / Admin] --> M[Add camera opens center modal - shared form]
  M --> F1[Name + CAM-code]
  F1 --> F2[Zone-Site cascader, inline create site]
  F2 --> F3[RTSP main + sub, or host/port/path + credentials]
  F3 --> F4[Lat/long via mini map-picker]
  F4 --> F5[Snapshot interval]
  F5 --> T[Test connection: RTSP DESCRIBE + grab 1 frame]
  T -- fail --> Err[Inline error, not saved]
  T -- pass --> Dup{Duplicate RTSP?}
  Dup -- yes --> Err2[Reject - name conflicting camera]
  Dup -- no --> Save[Save] --> Cap[Capability auto-detection] --> HC[Immediate health check]
```

Note (v1.5 shell): the dashboard's dashed "Add camera" card is retired; this modal is now the single entry point, shared across Cameras, Settings→Cameras, and Admin, and reuses the same form/validation described in section 7 (RTSP save with validation).

## 11. Backup-before-purge flow

```mermaid
flowchart TD
  A[Admin: Settings-Storage and Backup] --> R[Set retention days]
  A --> B[Enable Backup before purge]
  P[Retention purge due] --> Chk{Backup before purge enabled?}
  Chk -- yes --> Job[Backup job: ZIP images + metadata CSV] --> Sign[Signed link recorded in backup history] --> Purge[Purge expired data]
  Chk -- no --> Purge
  MB[Manual backup: pick date-range + zone/site] --> BJob[Background ZIP job] --> SDL[Signed download]
```

## 12. Map search → flyTo

```mermaid
sequenceDiagram
  participant U as User (Cameras 3D map)
  participant UI as Map UI
  U->>UI: search / select site or zone
  UI->>UI: flyTo(location) - smooth pan + zoom
  UI-->>U: status-colored camera pins for that area
  U->>UI: click pin
  UI-->>U: popover - Focus in Live Wall / Open detail
```

## 13. Zone click navigation

Clicking a sidebar zone, or a dashboard zone card, opens `/zones/:id` — a populated zone page (KPIs, sites, cameras, open incidents, uptime). Same destination regardless of entry point; scope-checked like all zone-scoped views.

Note (v1.5 shell): user profile now lives at the sidebar bottom (moved from the topbar); the sidebar zone list remains the primary nav entry point into zone pages.
