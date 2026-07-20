# Aniston VMS — Backend Schema

**Doc version: v1.1 · 18 July 2026 · Built for plan v1.5**

Prisma-style reference (PostgreSQL 16). All tables: `id` uuid pk, `created_at`, `updated_at` unless noted. Timestamps UTC.

---

## Enums

```
Role: SUPER_ADMIN | PROJECT_ADMIN | OPERATOR | ENGINEER | CLIENT_VIEWER | AUDITOR
ScopeType: ALL | REGION | ZONE | SITE | CAMERA
PermissionType: LIVE_VIEW
CameraStatus: HEALTHY | WARNING | CRITICAL | MAINTENANCE | UNKNOWN
Diagnosis: SITE_INTERNET_DOWN | SIM_SIGNAL_ISSUE | NETWORK_UNSTABLE | CAMERA_OFFLINE |
           CONFIG_ERROR | STREAM_DEGRADED | IMAGE_PROBLEM | WATERLOGGING
           // WATERLOGGING: placeholder, unused in v1.5 — Phase-2 waterlogging roadmap
CheckType: ROUTER_TCP | RTSP_PORT | RTSP_AUTH | VIDEO_VALIDATION | SNAPSHOT | IMAGE_ANALYSIS | SD_HEALTH
IncidentStatus: DETECTED | CONFIRMED | ALERTED | ACKNOWLEDGED | ASSIGNED | INVESTIGATING |
                RESOLVED | RECOVERY_VERIFIED | CLOSED
Severity: INFO | WARNING | CRITICAL
Channel: EMAIL | WHATSAPP
NotificationStatus: QUEUED | ACCEPTED | SENT | DELIVERED | READ | BOUNCED | FAILED
StreamKind: LIVE_SUB | LIVE_MAIN | PLAYBACK
PlaybackAdapter: ONVIF_G | HIKVISION | DAHUA | NONE
ClipStatus: QUEUED | PROCESSING | DONE | FAILED
TaskType: LENS_CLEANING | REPAIR | INSPECTION      TaskSource: AUTO | MANUAL
TaskStatus: OPEN | IN_PROGRESS | DONE | CANCELLED
LayoutKind: L1x1 | L2x2 | L3x2
```

## Identity & access

```
users            email @unique, password_hash, name, phone, role Role, mfa_secret?, mfa_enabled,
                 is_active, last_login_at
user_access_scopes  user_id → users, scope_type ScopeType, scope_id uuid?   // null when ALL
                 @@index([user_id])
user_permissions  user_id → users, permission PermissionType, granted_by → users, granted_at
                 @@unique([user_id, permission])
refresh_tokens   user_id, token_hash @unique, expires_at, revoked_at?
audit_logs       user_id?, action, entity_type, entity_id, old_value Json?, new_value Json?,
                 ip_address, created_at   @@index([entity_type, entity_id]) @@index([created_at])
```

## Hierarchy & devices

```
regions   name @unique ("North"…), status
zones     region_id → regions, name, latitude?, longitude?, status   @@unique([region_id, name])
sites     zone_id → zones, name, address, latitude, longitude, client_id?, status
routers   site_id → sites, serial_number, imei, sim_number, operator, public_static_ip,
          management_port, model, firmware_version, last_seen_at?, signal_strength?,
          connection_status, data_api_available bool
cameras   site_id → sites, router_id → routers, camera_code @unique ("CAM-042"), name,
          brand?, model?, firmware?, serial_number?,
          main_rtsp_url_enc, sub_rtsp_url_enc,                 // AES-256-GCM
          main_rtsp_hash @unique, sub_rtsp_hash @unique,       // normalized host+port+path
          rtsp_username_enc, rtsp_password_enc,
          onvif_port?, onvif_capabilities Json?, playback_adapter PlaybackAdapter, playback_verified,
          expected_codec, expected_resolution, expected_fps, expected_bitrate_kbps,
          status CameraStatus, health_score int, diagnosis Diagnosis?,
          last_healthy_at?, last_snapshot_at?, maintenance_mode bool,
          latitude float, longitude float, snapshot_interval_minutes int @default(60)
          @@index([site_id]) @@index([status])
reference_images  camera_id → cameras, s3_key, approved_by → users, approved_at
```

## Monitoring

```
health_checks   camera_id, check_type CheckType, started_at, completed_at?, success bool,
                response_time_ms?, error_code?, error_message?, codec?, resolution?, fps?,
                bitrate_kbps?, frames_received?, signal_dbm?, health_score?
                // PARTITION BY RANGE (started_at) monthly
                @@index([camera_id, started_at])
connection_quality_hourly  camera_id, hour timestamptz, success_rate float, median_latency_ms int,
                jitter_ms int, min_signal_dbm int?   @@unique([camera_id, hour])
snapshots       camera_id, captured_at, kind (SUB|EVIDENCE), original_key, thumbnail_key,
                brightness_score, blur_score, freeze_score, obstruction_score,
                scene_shift_score, dust_score, noise_score, color_cast_score,
                analysis_result Json, analysis_version,
                stamped bool @default(true), stamp_text?, latitude float?, longitude float?
                @@index([camera_id, captured_at])
sd_card_status  camera_id @unique, present bool, capacity_gb?, free_gb?, recording_enabled?,
                last_segment_at?, checked_at
recording_segments  camera_id, source ("sd_card"), track (MAIN|SUB), start_at, end_at, discovered_at
                @@index([camera_id, start_at])
sim_data_usage  router_id, period date, bytes_used bigint, budget_bytes bigint?
                @@unique([router_id, period])
```

## Incidents & alerting

```
incidents   incident_number @unique ("ANI-CAM-2026-000145"), camera_id?, site_id, zone_id,  // zone snapshotted
            type, severity Severity, status IncidentStatus, diagnosis Diagnosis?,
            first_detected_at, last_detected_at, acknowledged_at?, acknowledged_by?,
            assigned_to? → users, resolved_at?, recovery_verified_at?, closed_at?,
            root_cause?, resolution_notes?, corrective_action?, spare_parts?,
            previous_snapshot_id?, fault_snapshot_id?, downtime_seconds?, sla_impact bool
            @@index([status]) @@index([zone_id, first_detected_at])
incident_events  incident_id, actor?, event, detail Json?, created_at        // full timeline
alert_rules      name, condition Json, severity, consecutive_failures int, cooldown_minutes int,
                 escalation_policy_id?, enabled
escalation_policies      name, zone_id?          // null = default policy
escalation_steps         policy_id, after_minutes int, recipient_level, channels Channel[]
zone_alert_recipients    zone_id, severity Severity, channel Channel, recipient, escalation_level int
notifications   incident_id, channel Channel, recipient, template_name, provider_message_id?,
                status NotificationStatus, attempt_count, sent_at?, delivered_at?, read_at?,
                failed_at?, failure_reason?
                @@index([incident_id])
maintenance_windows  site_id?, camera_id?, start_at, end_at, reason, approved_by → users
maintenance_tasks    camera_id, type TaskType, source TaskSource, status TaskStatus,
                assigned_to? → users, before_snapshot_id?, after_snapshot_id?,
                notes?, completed_at?
```

## Streaming & playback

```
stream_sessions  camera_id, user_id, kind StreamKind, mediamtx_path, started_at,
                 last_heartbeat_at, ended_at?, end_reason?, client_ip, bytes_estimate bigint?
                 @@index([camera_id, ended_at]) @@index([user_id])
clip_exports     camera_id, requested_by → users, start_at, end_at, status ClipStatus,
                 s3_key?, size_bytes?, error?, incident_id?
saved_layouts    user_id, name, layout LayoutKind, camera_ids Json   @@unique([user_id, name])
```

## Retention & jobs

```
storage_policies  scope_type (ZONE|SITE), scope_id, store_clips bool @default(true),
                  store_snapshots bool @default(true)
                  @@unique([scope_type, scope_id])
system_settings   key @unique, value Json
                  // keys: retention_days, compression_quality, max_live_sessions_global, max_live_sessions_per_site
backups           requested_by → users, scope_type?, scope_id?, range_start, range_end,
                  status (QUEUED|RUNNING|DONE|FAILED), file_key?, size_bytes?, error?, created_at
```

Nightly workers: prune `snapshots` per policy (skip incident-linked), expire `recording_segments` cache >35 d, close stale `stream_sessions`, roll `connection_quality_hourly`, S3 lifecycle rules mirror DB policy. Seeds: 4 regions, 13 zones (Delhi structure), 2 demo sites, 2 routers, 6 simulator cameras (`playback_adapter=ONVIF_G`), default alert rules matrix, default escalation policy, one admin user.

**Seed updates (v1.5):** real Delhi lat/long for all zones, sites, and all 125 cameras (for map pins); demo `LIVE_VIEW` grants — admin and one operator have it, one engineer does not; one completed demo `backups` row; one camera-scoped demo user; populated data so every zone page (`/zones/:id`) is non-empty. Delivered as a real Prisma migration (no `db push` drift).
