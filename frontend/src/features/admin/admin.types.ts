// Aniston VMS admin domain types — mirror the backend admin module exactly:
//   backend/src/modules/admin/users.schemas.ts + users.service.ts (toPublicUser)
//   backend/src/modules/admin/escalation.schemas.ts + escalation.service.ts
//   backend/src/modules/admin/notifications.schemas.ts + notifications.service.ts
//   backend/src/modules/admin/audit-log.schemas.ts + audit-log.service.ts
// All four admin sub-routers are mounted at the `/api` root (backend/src/app.ts),
// so relative to the RTK Query baseUrl the paths are /users,
// /escalation-policies, /zone-alert-recipients, /notifications and /audit-log.

import type { Role, ScopeType } from '@/features/auth/auth.types';

// Prisma enums (prisma/schema.prisma) not already mirrored in auth.types.
export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AlertChannel = 'EMAIL' | 'WHATSAPP';
export type NotificationStatus =
  'QUEUED' | 'ACCEPTED' | 'SENT' | 'DELIVERED' | 'READ' | 'BOUNCED' | 'FAILED';

export const ALERT_SEVERITIES: readonly AlertSeverity[] = ['INFO', 'WARNING', 'CRITICAL'];
export const ALERT_CHANNELS: readonly AlertChannel[] = ['EMAIL', 'WHATSAPP'];
export const NOTIFICATION_STATUSES: readonly NotificationStatus[] = [
  'QUEUED',
  'ACCEPTED',
  'SENT',
  'DELIVERED',
  'READ',
  'BOUNCED',
  'FAILED',
];

/** Backend list envelope — every admin list endpoint returns this exact shape. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Users (users.service.ts toPublicUser — note: no isActive in the wire shape) ───

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
}

export interface UserListQuery {
  page?: number;
  limit?: number;
  role?: Role;
  search?: string;
}

export interface CreateUserInput {
  email: string;
  password: string; // 8-128 chars
  name: string;
  phone: string;
  role: Role;
}

export interface UpdateUserInput {
  name?: string;
  phone?: string;
  role?: Role;
  isActive?: boolean;
  password?: string;
}

/** prisma `model UserAccessScope` row, returned verbatim by the service. */
export interface UserAccessScope {
  id: string;
  userId: string;
  scopeType: ScopeType;
  scopeId: string | null; // null when scopeType is ALL
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccessScopeInput {
  scopeType: ScopeType;
  scopeId?: string; // required unless scopeType is ALL
}

// ─── Region / Zone / Site lookups (lightweight — for pickers only; the real
// hierarchy CRUD lives in the settings feature, which we must not import from).
// Mirrors hierarchy.service.ts's { id, name } projection for these routes.

export interface RegionRefLite {
  id: string;
  name: string;
}

export interface SiteRefLite {
  id: string;
  name: string;
}

// ─── Escalation policies / steps / zone alert recipients ───

export interface ZoneRefLite {
  id: string;
  name: string;
}

export interface EscalationStep {
  id: string;
  policyId: string;
  afterMinutes: number; // 0..10080
  recipientLevel: string;
  channels: AlertChannel[];
  createdAt: string;
  updatedAt: string;
}

export interface EscalationPolicy {
  id: string;
  name: string;
  zoneId: string | null; // null = default (fallback) policy
  createdAt: string;
  updatedAt: string;
  zone: ZoneRefLite | null;
  steps: EscalationStep[]; // ordered by afterMinutes asc
}

export interface PolicyListQuery {
  page?: number;
  limit?: number;
  zoneId?: string;
}

export interface CreatePolicyInput {
  name: string;
  zoneId?: string; // omitted = default policy
}

export interface UpdatePolicyInput {
  name?: string;
  zoneId?: string | null; // explicit null clears back to "default policy"
}

export interface CreateStepInput {
  afterMinutes: number;
  recipientLevel: string;
  channels: AlertChannel[]; // min 1
}

export interface UpdateStepInput {
  afterMinutes?: number;
  recipientLevel?: string;
  channels?: AlertChannel[];
}

export interface ZoneAlertRecipient {
  id: string;
  zoneId: string;
  severity: AlertSeverity;
  channel: AlertChannel;
  recipient: string; // email address or E.164 phone/WhatsApp id
  escalationLevel: number; // 1..10
  createdAt: string;
  updatedAt: string;
  zone: ZoneRefLite;
}

export interface RecipientListQuery {
  page?: number;
  limit?: number;
  zoneId?: string;
  severity?: AlertSeverity;
  channel?: AlertChannel;
}

export interface CreateRecipientInput {
  zoneId: string;
  severity: AlertSeverity;
  channel: AlertChannel;
  recipient: string;
  escalationLevel: number;
}

export interface UpdateRecipientInput {
  severity?: AlertSeverity;
  channel?: AlertChannel;
  recipient?: string;
  escalationLevel?: number;
}

// ─── Notifications (read-only delivery log) ───

/** notifications.service.ts INCIDENT_SUMMARY_SELECT. */
export interface IncidentSummaryRef {
  id: string;
  incidentNumber: string;
  type: string;
  severity: AlertSeverity;
  status: string;
  zoneId: string;
  siteId: string | null;
  cameraId: string | null;
}

export interface NotificationRow {
  id: string;
  incidentId: string;
  channel: AlertChannel;
  recipient: string;
  templateName: string;
  providerMessageId: string | null;
  status: NotificationStatus;
  attemptCount: number;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  incident: IncidentSummaryRef;
}

export interface NotificationListQuery {
  page?: number;
  limit?: number;
  incidentId?: string;
  status?: NotificationStatus;
  channel?: AlertChannel;
}

// ─── Audit log (append-only compliance trail) ───

export interface AuditUserRef {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface AuditLogRow {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string;
  createdAt: string;
  user: AuditUserRef | null;
}

export interface AuditLogListQuery {
  page?: number;
  limit?: number;
  startDate?: string; // ISO 8601
  endDate?: string; // ISO 8601
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: string;
}

// ─── Role gates — mirror the router-level requireRole guards exactly ───

/** GET /users — users.router.ts READ_ROLES. */
export function canReadUsers(role: Role | undefined | null): boolean {
  return role === 'SUPER_ADMIN' || role === 'PROJECT_ADMIN';
}

/** POST/PATCH/DELETE /users + access-scope mutations — users.router.ts WRITE_ROLES. */
export function canWriteUsers(role: Role | undefined | null): boolean {
  return role === 'SUPER_ADMIN';
}

/** Escalation policies / steps / recipients — escalation.router.ts ADMIN_ROLES. */
export function canManageEscalation(role: Role | undefined | null): boolean {
  return role === 'SUPER_ADMIN' || role === 'PROJECT_ADMIN';
}

/** GET /audit-log — audit-log.router.ts AUDIT_ROLES. */
export function canViewAuditLog(role: Role | undefined | null): boolean {
  return role === 'SUPER_ADMIN' || role === 'AUDITOR';
}
