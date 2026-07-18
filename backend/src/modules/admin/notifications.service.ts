import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { getUserScope, zoneScopeWhere } from '../../lib/scope.js';
import { NotFoundError } from '../../middleware/errorHandler.js';
import type { AuthUser as ActorUser } from '../../middleware/auth.js';
import type { NotificationListQuery } from './notifications.schemas.js';

// Admin API — read-only delivery log for outbound alerts (Notification rows
// written by backend/src/modules/incidents/notification.service.ts). Scoped
// through the parent Incident's zone, same pattern as every other
// zone-relation query (see backend/src/lib/scope.ts).

const INCIDENT_SUMMARY_SELECT = {
  id: true,
  incidentNumber: true,
  type: true,
  severity: true,
  status: true,
  zoneId: true,
  siteId: true,
  cameraId: true,
} as const;

export async function listNotifications(actor: ActorUser, filters: NotificationListQuery) {
  const { page, limit, incidentId, status, channel } = filters;
  const scope = await getUserScope(actor.id);

  const where: Prisma.NotificationWhereInput = {
    incident: { zone: zoneScopeWhere(scope) },
    ...(incidentId ? { incidentId } : {}),
    ...(status ? { status } : {}),
    ...(channel ? { channel } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      include: { incident: { select: INCIDENT_SUMMARY_SELECT } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notification.count({ where }),
  ]);

  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export async function getNotificationById(id: string, actor: ActorUser) {
  const scope = await getUserScope(actor.id);
  const notification = await prisma.notification.findFirst({
    where: { AND: [{ id }, { incident: { zone: zoneScopeWhere(scope) } }] },
    include: { incident: { select: INCIDENT_SUMMARY_SELECT } },
  });
  if (!notification) throw new NotFoundError('Notification not found');
  return notification;
}
