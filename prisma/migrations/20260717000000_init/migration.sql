-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'PROJECT_ADMIN', 'OPERATOR', 'ENGINEER', 'CLIENT_VIEWER', 'AUDITOR');

-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('ALL', 'REGION', 'ZONE', 'SITE');

-- CreateEnum
CREATE TYPE "CameraStatus" AS ENUM ('HEALTHY', 'WARNING', 'CRITICAL', 'MAINTENANCE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Diagnosis" AS ENUM ('SITE_INTERNET_DOWN', 'SIM_SIGNAL_ISSUE', 'NETWORK_UNSTABLE', 'CAMERA_OFFLINE', 'CONFIG_ERROR', 'STREAM_DEGRADED', 'IMAGE_PROBLEM');

-- CreateEnum
CREATE TYPE "CheckType" AS ENUM ('ROUTER_TCP', 'RTSP_PORT', 'RTSP_AUTH', 'VIDEO_VALIDATION', 'SNAPSHOT', 'IMAGE_ANALYSIS', 'SD_HEALTH');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('DETECTED', 'CONFIRMED', 'ALERTED', 'ACKNOWLEDGED', 'ASSIGNED', 'INVESTIGATING', 'RESOLVED', 'RECOVERY_VERIFIED', 'CLOSED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'ACCEPTED', 'SENT', 'DELIVERED', 'READ', 'BOUNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "StreamKind" AS ENUM ('LIVE_SUB', 'LIVE_MAIN', 'PLAYBACK');

-- CreateEnum
CREATE TYPE "PlaybackAdapter" AS ENUM ('ONVIF_G', 'HIKVISION', 'DAHUA', 'NONE');

-- CreateEnum
CREATE TYPE "ClipStatus" AS ENUM ('QUEUED', 'PROCESSING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('LENS_CLEANING', 'REPAIR', 'INSPECTION');

-- CreateEnum
CREATE TYPE "TaskSource" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LayoutKind" AS ENUM ('L1x1', 'L2x2', 'L3x2');

-- CreateEnum
CREATE TYPE "SnapshotKind" AS ENUM ('SUB', 'EVIDENCE');

-- CreateEnum
CREATE TYPE "RecordingTrack" AS ENUM ('MAIN', 'SUB');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "mfa_secret" TEXT,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_access_scopes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scope_type" "ScopeType" NOT NULL,
    "scope_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_access_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip_address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "region_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL,
    "zone_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "client_id" TEXT,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routers" (
    "id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "serial_number" TEXT NOT NULL,
    "imei" TEXT NOT NULL,
    "sim_number" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "public_static_ip" TEXT NOT NULL,
    "management_port" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "firmware_version" TEXT NOT NULL,
    "last_seen_at" TIMESTAMP(3),
    "signal_strength" INTEGER,
    "connection_status" TEXT NOT NULL,
    "data_api_available" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cameras" (
    "id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "router_id" TEXT NOT NULL,
    "camera_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "firmware" TEXT,
    "serial_number" TEXT,
    "main_rtsp_url_enc" TEXT NOT NULL,
    "sub_rtsp_url_enc" TEXT NOT NULL,
    "main_rtsp_hash" TEXT NOT NULL,
    "sub_rtsp_hash" TEXT NOT NULL,
    "rtsp_username_enc" TEXT NOT NULL,
    "rtsp_password_enc" TEXT NOT NULL,
    "onvif_port" INTEGER,
    "onvif_capabilities" JSONB,
    "playback_adapter" "PlaybackAdapter" NOT NULL DEFAULT 'NONE',
    "playback_verified" BOOLEAN NOT NULL DEFAULT false,
    "expected_codec" TEXT NOT NULL,
    "expected_resolution" TEXT NOT NULL,
    "expected_fps" INTEGER NOT NULL,
    "expected_bitrate_kbps" INTEGER NOT NULL,
    "status" "CameraStatus" NOT NULL DEFAULT 'UNKNOWN',
    "health_score" INTEGER NOT NULL DEFAULT 0,
    "diagnosis" "Diagnosis",
    "last_healthy_at" TIMESTAMP(3),
    "last_snapshot_at" TIMESTAMP(3),
    "maintenance_mode" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cameras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_images" (
    "id" TEXT NOT NULL,
    "camera_id" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "approved_by" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reference_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_checks" (
    "id" TEXT NOT NULL,
    "camera_id" TEXT NOT NULL,
    "check_type" "CheckType" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "success" BOOLEAN NOT NULL,
    "response_time_ms" INTEGER,
    "error_code" TEXT,
    "error_message" TEXT,
    "codec" TEXT,
    "resolution" TEXT,
    "fps" INTEGER,
    "bitrate_kbps" INTEGER,
    "frames_received" INTEGER,
    "signal_dbm" INTEGER,
    "health_score" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "health_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connection_quality_hourly" (
    "id" TEXT NOT NULL,
    "camera_id" TEXT NOT NULL,
    "hour" TIMESTAMPTZ(6) NOT NULL,
    "success_rate" DOUBLE PRECISION NOT NULL,
    "median_latency_ms" INTEGER NOT NULL,
    "jitter_ms" INTEGER NOT NULL,
    "min_signal_dbm" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connection_quality_hourly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snapshots" (
    "id" TEXT NOT NULL,
    "camera_id" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "kind" "SnapshotKind" NOT NULL,
    "original_key" TEXT NOT NULL,
    "thumbnail_key" TEXT NOT NULL,
    "brightness_score" DOUBLE PRECISION NOT NULL,
    "blur_score" DOUBLE PRECISION NOT NULL,
    "freeze_score" DOUBLE PRECISION NOT NULL,
    "obstruction_score" DOUBLE PRECISION NOT NULL,
    "scene_shift_score" DOUBLE PRECISION NOT NULL,
    "dust_score" DOUBLE PRECISION NOT NULL,
    "noise_score" DOUBLE PRECISION NOT NULL,
    "color_cast_score" DOUBLE PRECISION NOT NULL,
    "analysis_result" JSONB NOT NULL,
    "analysis_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sd_card_status" (
    "id" TEXT NOT NULL,
    "camera_id" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL,
    "capacity_gb" DOUBLE PRECISION,
    "free_gb" DOUBLE PRECISION,
    "recording_enabled" BOOLEAN,
    "last_segment_at" TIMESTAMP(3),
    "checked_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sd_card_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recording_segments" (
    "id" TEXT NOT NULL,
    "camera_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'sd_card',
    "track" "RecordingTrack" NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "discovered_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recording_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sim_data_usage" (
    "id" TEXT NOT NULL,
    "router_id" TEXT NOT NULL,
    "period" DATE NOT NULL,
    "bytes_used" BIGINT NOT NULL,
    "budget_bytes" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sim_data_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "incident_number" TEXT NOT NULL,
    "camera_id" TEXT,
    "site_id" TEXT NOT NULL,
    "zone_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "status" "IncidentStatus" NOT NULL,
    "diagnosis" "Diagnosis",
    "first_detected_at" TIMESTAMP(3) NOT NULL,
    "last_detected_at" TIMESTAMP(3) NOT NULL,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by" TEXT,
    "assigned_to" TEXT,
    "resolved_at" TIMESTAMP(3),
    "recovery_verified_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "root_cause" TEXT,
    "resolution_notes" TEXT,
    "corrective_action" TEXT,
    "spare_parts" TEXT,
    "previous_snapshot_id" TEXT,
    "fault_snapshot_id" TEXT,
    "downtime_seconds" INTEGER,
    "sla_impact" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_events" (
    "id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "actor" TEXT,
    "event" TEXT NOT NULL,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "condition" JSONB NOT NULL,
    "severity" "Severity" NOT NULL,
    "consecutive_failures" INTEGER NOT NULL,
    "cooldown_minutes" INTEGER NOT NULL,
    "escalation_policy_id" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalation_policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zone_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escalation_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalation_steps" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "after_minutes" INTEGER NOT NULL,
    "recipient_level" TEXT NOT NULL,
    "channels" "Channel"[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escalation_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone_alert_recipients" (
    "id" TEXT NOT NULL,
    "zone_id" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "channel" "Channel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "escalation_level" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zone_alert_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "template_name" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "status" "NotificationStatus" NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_windows" (
    "id" TEXT NOT NULL,
    "site_id" TEXT,
    "camera_id" TEXT,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "approved_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_tasks" (
    "id" TEXT NOT NULL,
    "camera_id" TEXT NOT NULL,
    "type" "TaskType" NOT NULL,
    "source" "TaskSource" NOT NULL,
    "status" "TaskStatus" NOT NULL,
    "assigned_to" TEXT,
    "before_snapshot_id" TEXT,
    "after_snapshot_id" TEXT,
    "notes" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stream_sessions" (
    "id" TEXT NOT NULL,
    "camera_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "StreamKind" NOT NULL,
    "mediamtx_path" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "last_heartbeat_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "end_reason" TEXT,
    "client_ip" TEXT NOT NULL,
    "bytes_estimate" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stream_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clip_exports" (
    "id" TEXT NOT NULL,
    "camera_id" TEXT NOT NULL,
    "requested_by" TEXT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "status" "ClipStatus" NOT NULL,
    "s3_key" TEXT,
    "size_bytes" BIGINT,
    "error" TEXT,
    "incident_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clip_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_layouts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "layout" "LayoutKind" NOT NULL,
    "camera_ids" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "user_access_scopes_user_id_idx" ON "user_access_scopes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "regions_name_key" ON "regions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "zones_region_id_name_key" ON "zones"("region_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "cameras_camera_code_key" ON "cameras"("camera_code");

-- CreateIndex
CREATE UNIQUE INDEX "cameras_main_rtsp_hash_key" ON "cameras"("main_rtsp_hash");

-- CreateIndex
CREATE UNIQUE INDEX "cameras_sub_rtsp_hash_key" ON "cameras"("sub_rtsp_hash");

-- CreateIndex
CREATE INDEX "cameras_site_id_idx" ON "cameras"("site_id");

-- CreateIndex
CREATE INDEX "cameras_status_idx" ON "cameras"("status");

-- CreateIndex
CREATE INDEX "health_checks_camera_id_started_at_idx" ON "health_checks"("camera_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "connection_quality_hourly_camera_id_hour_key" ON "connection_quality_hourly"("camera_id", "hour");

-- CreateIndex
CREATE INDEX "snapshots_camera_id_captured_at_idx" ON "snapshots"("camera_id", "captured_at");

-- CreateIndex
CREATE UNIQUE INDEX "sd_card_status_camera_id_key" ON "sd_card_status"("camera_id");

-- CreateIndex
CREATE INDEX "recording_segments_camera_id_start_at_idx" ON "recording_segments"("camera_id", "start_at");

-- CreateIndex
CREATE UNIQUE INDEX "sim_data_usage_router_id_period_key" ON "sim_data_usage"("router_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_incident_number_key" ON "incidents"("incident_number");

-- CreateIndex
CREATE INDEX "incidents_status_idx" ON "incidents"("status");

-- CreateIndex
CREATE INDEX "incidents_zone_id_first_detected_at_idx" ON "incidents"("zone_id", "first_detected_at");

-- CreateIndex
CREATE INDEX "notifications_incident_id_idx" ON "notifications"("incident_id");

-- CreateIndex
CREATE INDEX "stream_sessions_camera_id_ended_at_idx" ON "stream_sessions"("camera_id", "ended_at");

-- CreateIndex
CREATE INDEX "stream_sessions_user_id_idx" ON "stream_sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_layouts_user_id_name_key" ON "saved_layouts"("user_id", "name");

-- AddForeignKey
ALTER TABLE "user_access_scopes" ADD CONSTRAINT "user_access_scopes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routers" ADD CONSTRAINT "routers_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cameras" ADD CONSTRAINT "cameras_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cameras" ADD CONSTRAINT "cameras_router_id_fkey" FOREIGN KEY ("router_id") REFERENCES "routers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_images" ADD CONSTRAINT "reference_images_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_images" ADD CONSTRAINT "reference_images_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_checks" ADD CONSTRAINT "health_checks_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_quality_hourly" ADD CONSTRAINT "connection_quality_hourly_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sd_card_status" ADD CONSTRAINT "sd_card_status_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_segments" ADD CONSTRAINT "recording_segments_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sim_data_usage" ADD CONSTRAINT "sim_data_usage_router_id_fkey" FOREIGN KEY ("router_id") REFERENCES "routers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_previous_snapshot_id_fkey" FOREIGN KEY ("previous_snapshot_id") REFERENCES "snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_fault_snapshot_id_fkey" FOREIGN KEY ("fault_snapshot_id") REFERENCES "snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_escalation_policy_id_fkey" FOREIGN KEY ("escalation_policy_id") REFERENCES "escalation_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalation_policies" ADD CONSTRAINT "escalation_policies_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalation_steps" ADD CONSTRAINT "escalation_steps_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "escalation_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_alert_recipients" ADD CONSTRAINT "zone_alert_recipients_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_before_snapshot_id_fkey" FOREIGN KEY ("before_snapshot_id") REFERENCES "snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_after_snapshot_id_fkey" FOREIGN KEY ("after_snapshot_id") REFERENCES "snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stream_sessions" ADD CONSTRAINT "stream_sessions_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stream_sessions" ADD CONSTRAINT "stream_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clip_exports" ADD CONSTRAINT "clip_exports_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clip_exports" ADD CONSTRAINT "clip_exports_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clip_exports" ADD CONSTRAINT "clip_exports_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_layouts" ADD CONSTRAINT "saved_layouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

