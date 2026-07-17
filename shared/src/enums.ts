// Shared enums for Aniston VMS — mirrors prisma/schema.prisma exactly.
// Source of truth: docs/05-backend-schema.md §Enums.
// Keep in sync with prisma/schema.prisma (rule-database.md). Frontend and
// backend import these WITHOUT depending on the generated Prisma client.

export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  PROJECT_ADMIN = 'PROJECT_ADMIN',
  OPERATOR = 'OPERATOR',
  ENGINEER = 'ENGINEER',
  CLIENT_VIEWER = 'CLIENT_VIEWER',
  AUDITOR = 'AUDITOR',
}

export enum ScopeType {
  ALL = 'ALL',
  REGION = 'REGION',
  ZONE = 'ZONE',
  SITE = 'SITE',
}

export enum CameraStatus {
  HEALTHY = 'HEALTHY',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
  MAINTENANCE = 'MAINTENANCE',
  UNKNOWN = 'UNKNOWN',
}

export enum Diagnosis {
  SITE_INTERNET_DOWN = 'SITE_INTERNET_DOWN',
  SIM_SIGNAL_ISSUE = 'SIM_SIGNAL_ISSUE',
  NETWORK_UNSTABLE = 'NETWORK_UNSTABLE',
  CAMERA_OFFLINE = 'CAMERA_OFFLINE',
  CONFIG_ERROR = 'CONFIG_ERROR',
  STREAM_DEGRADED = 'STREAM_DEGRADED',
  IMAGE_PROBLEM = 'IMAGE_PROBLEM',
}

export enum CheckType {
  ROUTER_TCP = 'ROUTER_TCP',
  RTSP_PORT = 'RTSP_PORT',
  RTSP_AUTH = 'RTSP_AUTH',
  VIDEO_VALIDATION = 'VIDEO_VALIDATION',
  SNAPSHOT = 'SNAPSHOT',
  IMAGE_ANALYSIS = 'IMAGE_ANALYSIS',
  SD_HEALTH = 'SD_HEALTH',
}

export enum IncidentStatus {
  DETECTED = 'DETECTED',
  CONFIRMED = 'CONFIRMED',
  ALERTED = 'ALERTED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  ASSIGNED = 'ASSIGNED',
  INVESTIGATING = 'INVESTIGATING',
  RESOLVED = 'RESOLVED',
  RECOVERY_VERIFIED = 'RECOVERY_VERIFIED',
  CLOSED = 'CLOSED',
}

export enum Severity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

export enum Channel {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
}

export enum NotificationStatus {
  QUEUED = 'QUEUED',
  ACCEPTED = 'ACCEPTED',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  BOUNCED = 'BOUNCED',
  FAILED = 'FAILED',
}

export enum StreamKind {
  LIVE_SUB = 'LIVE_SUB',
  LIVE_MAIN = 'LIVE_MAIN',
  PLAYBACK = 'PLAYBACK',
}

export enum PlaybackAdapter {
  ONVIF_G = 'ONVIF_G',
  HIKVISION = 'HIKVISION',
  DAHUA = 'DAHUA',
  NONE = 'NONE',
}

export enum ClipStatus {
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  DONE = 'DONE',
  FAILED = 'FAILED',
}

export enum TaskType {
  LENS_CLEANING = 'LENS_CLEANING',
  REPAIR = 'REPAIR',
  INSPECTION = 'INSPECTION',
}

export enum TaskSource {
  AUTO = 'AUTO',
  MANUAL = 'MANUAL',
}

export enum TaskStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
  CANCELLED = 'CANCELLED',
}

export enum LayoutKind {
  L1x1 = 'L1x1',
  L2x2 = 'L2x2',
  L3x2 = 'L3x2',
}

export enum SnapshotKind {
  SUB = 'SUB',
  EVIDENCE = 'EVIDENCE',
}

export enum RecordingTrack {
  MAIN = 'MAIN',
  SUB = 'SUB',
}
