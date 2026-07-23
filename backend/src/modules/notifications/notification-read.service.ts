import { prisma } from '../../lib/prisma.js';
import { getUserScope, zoneScopeWhere } from '../../lib/scope.js';
import { OPEN_STATUS_LIST } from '../incidents/incident.constants.js';
import {
  listRecentIncidentSummaries,
  type IncidentSummaryDto,
} from '../dashboard/dashboard.widgets.js';
import { NotFoundError } from '../../middleware/errorHandler.js';

// ─────────────────────────────────────────────────────────────────────────────
// Per-user notification read-state (the in-app notification bell).
//
// A "notification" here is an open incident the caller is allowed to see. Read
// state is stored as IncidentReadReceipt rows — presence = read, absence =
// unread — so a freshly created incident is unread for EVERY authorized user
// with no back-fill required (docs/05-backend-schema.md; see schema comment).
//
// Every read/write is filtered through the caller's user_access_scopes
// (lib/scope.ts, fail-closed via empty `in: []`), and every write is keyed to
// the authenticated userId, so a user can only ever change their OWN read
// state and only for incidents inside their OWN scope.
// ─────────────────────────────────────────────────────────────────────────────

const NOTIFICATION_FEED_LIMIT = 20; // rows shown in the bell dropdown

export interface NotificationItemDto extends IncidentSummaryDto {
  isRead: boolean;
  readAt: string | null;
}

export interface UnreadCountDto {
  count: number;
}

export interface MarkReadResultDto {
  /** Fresh unread count so the badge can update without a refetch. */
  unreadCount: number;
  /** Rows created by this call (0 when already read / nothing to mark). */
  marked: number;
}

/**
 * The bell feed: the caller's most-recent in-scope OPEN incidents, each tagged
 * with the caller's read state. Reuses the scope-filtered summary shape from the
 * dashboard widget (single source of truth), then merges this user's receipts.
 */
export async function getNotificationFeed(
  userId: string,
  limit = NOTIFICATION_FEED_LIMIT,
): Promise<NotificationItemDto[]> {
  const summaries = await listRecentIncidentSummaries(userId, limit);
  if (summaries.length === 0) return [];

  const receipts = await prisma.incidentReadReceipt.findMany({
    where: { userId, incidentId: { in: summaries.map((s) => s.id) } },
    select: { incidentId: true, readAt: true },
  });
  const readAtById = new Map(receipts.map((r) => [r.incidentId, r.readAt.toISOString()]));

  return summaries.map((summary) => ({
    ...summary,
    isRead: readAtById.has(summary.id),
    readAt: readAtById.get(summary.id) ?? null,
  }));
}

/**
 * Count of in-scope OPEN incidents this user has NOT read yet — drives the red
 * dot / badge. Counts across ALL matching incidents, not just the feed page, so
 * the badge is accurate even when more than a page-worth are unread. A user with
 * no scope fails closed (empty `in: []` matches nothing) → count 0.
 */
export async function getUnreadCount(userId: string): Promise<UnreadCountDto> {
  const scope = await getUserScope(userId);
  const count = await prisma.incident.count({
    where: {
      zone: zoneScopeWhere(scope),
      status: { in: OPEN_STATUS_LIST },
      readReceipts: { none: { userId } },
    },
  });
  return { count };
}

/**
 * Mark a single incident read for the caller. Verifies the incident is inside
 * the caller's scope first (404 otherwise — a user cannot mark-read something
 * they can't see). Idempotent via the (userId, incidentId) unique constraint:
 * calling twice keeps the original readAt and never creates a duplicate.
 */
export async function markNotificationRead(
  userId: string,
  incidentId: string,
): Promise<MarkReadResultDto> {
  const scope = await getUserScope(userId);
  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, zone: zoneScopeWhere(scope) },
    select: { id: true },
  });
  if (!incident) throw new NotFoundError('Incident not found');

  const receipt = await prisma.incidentReadReceipt.upsert({
    where: { userId_incidentId: { userId, incidentId } },
    create: { userId, incidentId },
    update: {}, // already read → no-op, preserve original readAt
    select: { createdAt: true, readAt: true },
  });

  const { count } = await getUnreadCount(userId);
  // A brand-new receipt has createdAt === readAt; an existing one does not.
  const marked = receipt.createdAt.getTime() === receipt.readAt.getTime() ? 1 : 0;
  return { unreadCount: count, marked };
}

/**
 * Mark every in-scope unread incident read for the caller in one shot. Only
 * creates receipts for the authenticated user and only for incidents in scope;
 * skipDuplicates keeps it dup-proof under concurrent calls.
 */
export async function markAllNotificationsRead(userId: string): Promise<MarkReadResultDto> {
  const scope = await getUserScope(userId);
  const unread = await prisma.incident.findMany({
    where: {
      zone: zoneScopeWhere(scope),
      status: { in: OPEN_STATUS_LIST },
      readReceipts: { none: { userId } },
    },
    select: { id: true },
  });

  if (unread.length > 0) {
    await prisma.incidentReadReceipt.createMany({
      data: unread.map((incident) => ({ userId, incidentId: incident.id })),
      skipDuplicates: true,
    });
  }

  return { unreadCount: 0, marked: unread.length };
}
