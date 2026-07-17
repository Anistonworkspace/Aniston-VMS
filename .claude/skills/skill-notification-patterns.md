# Skill — Notification System Patterns

Full lifecycle: create DB record → BullMQ → email + socket push → bell icon → mark as read.

---

## Prisma model

```prisma
// prisma/schema.prisma — add this model
model Notification {
  id             String    @id @default(uuid())
  organizationId String
  userId         String    // recipient

  type           String    // e.g. 'ITEM_APPROVED', 'TASK_ASSIGNED'
  title          String
  body           String
  isRead         Boolean   @default(false)
  readAt         DateTime?

  entityId       String?   // the record this notification is about
  entityType     String?   // 'Item', 'Category', etc.
  actionUrl      String?   // optional deep link

  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  deletedAt      DateTime?

  user           User      @relation(fields: [userId], references: [id], onDelete: Restrict)
  organization   Organization @relation(fields: [organizationId], references: [id])

  @@index([organizationId])
  @@index([userId])
  @@index([userId, isRead])         // for fetching unread count efficiently
  @@index([createdAt])
}
```

---

## Shared enum

```typescript
// shared/src/enums.ts — add to existing enums
export enum NotificationType {
  ITEM_SUBMITTED    = 'ITEM_SUBMITTED',
  ITEM_APPROVED     = 'ITEM_APPROVED',
  ITEM_REJECTED     = 'ITEM_REJECTED',
  TASK_ASSIGNED     = 'TASK_ASSIGNED',
  DOCUMENT_UPLOADED = 'DOCUMENT_UPLOADED',
  MENTION           = 'MENTION',
  SYSTEM            = 'SYSTEM',
}
```

---

## Notification service

```typescript
// backend/src/modules/notification/notification.service.ts
import { prisma } from '../../lib/prisma.js';
import { notificationQueue } from '../../jobs/queues.js';
import { getIO } from '../../lib/socket.js';
import type { AuthUser } from '@boilerplate/shared';

export class NotificationService {

  // ── Send a notification (called by other services) ───────────────────────
  static async send({
    organizationId,
    userId,
    type,
    title,
    body,
    entityId,
    entityType,
    actionUrl,
  }: {
    organizationId: string;
    userId: string;
    type: string;
    title: string;
    body: string;
    entityId?: string;
    entityType?: string;
    actionUrl?: string;
  }) {
    // For real-time delivery: add to queue (worker persists + emits)
    await notificationQueue.add('send', {
      organizationId, userId, type, title, body, entityId, entityType, actionUrl,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
    });
  }

  // ── List notifications for the current user ──────────────────────────────
  static async list(actor: AuthUser, page = 1, limit = 20) {
    const where = {
      userId: actor.id,
      organizationId: actor.organizationId,
      deletedAt: null,
    };

    const [data, total, unreadCount] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { ...where, isRead: false } }),
    ]);

    return { data, meta: { page, limit, total, unreadCount } };
  }

  // ── Mark one as read ─────────────────────────────────────────────────────
  static async markRead(id: string, actor: AuthUser) {
    await prisma.notification.updateMany({
      where: { id, userId: actor.id, organizationId: actor.organizationId },
      data: { isRead: true, readAt: new Date() },
    });
    // Emit to update unread count in header
    getIO().to(`user:${actor.id}`).emit('notification:read', { id });
  }

  // ── Mark all as read ─────────────────────────────────────────────────────
  static async markAllRead(actor: AuthUser) {
    await prisma.notification.updateMany({
      where: { userId: actor.id, organizationId: actor.organizationId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    getIO().to(`user:${actor.id}`).emit('notification:all-read');
  }
}
```

---

## How other services send notifications

```typescript
// In ItemService.approve()
await NotificationService.send({
  organizationId: actor.organizationId,
  userId: item.ownerId,                   // the item owner's user ID
  type:  NotificationType.ITEM_APPROVED,
  title: 'Item approved',
  body:  `Your ${item.type} item from ${item.startDate} has been approved.`,
  entityId:   item.id,
  entityType: 'Item',
  actionUrl:  `/items/${item.id}`,
});
```

---

## RTK Query API slice

```typescript
// frontend/src/features/notifications/notificationApi.ts
export const notificationApi = createApi({
  reducerPath: 'notificationApi',
  baseQuery,
  tagTypes: ['Notification'],
  endpoints: (builder) => ({
    getNotifications: builder.query<PaginatedResponse<Notification> & { meta: { unreadCount: number } }, { page?: number }>({
      query: ({ page = 1 } = {}) => `/notifications?page=${page}&limit=20`,
      providesTags: ['Notification'],
    }),
    markRead: builder.mutation<void, string>({
      query: (id) => ({ url: `/notifications/${id}/read`, method: 'PATCH' }),
      invalidatesTags: ['Notification'],
    }),
    markAllRead: builder.mutation<void, void>({
      query: () => ({ url: '/notifications/read-all', method: 'PATCH' }),
      invalidatesTags: ['Notification'],
    }),
  }),
});
```

---

## Bell icon with unread count

```typescript
// frontend/src/components/layout/NotificationBell.tsx
import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useGetNotificationsQuery, useMarkReadMutation, useMarkAllReadMutation } from '@/features/notifications/notificationApi';
import { getSocket } from '@/lib/socket';
import { notificationApi } from '@/features/notifications/notificationApi';
import { useDispatch } from 'react-redux';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const dispatch = useDispatch();
  const { data } = useGetNotificationsQuery({});
  const [markRead]    = useMarkReadMutation();
  const [markAllRead] = useMarkAllReadMutation();

  const unreadCount = data?.meta?.unreadCount ?? 0;

  // Listen for new notifications via socket
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onNew = () => {
      dispatch(notificationApi.util.invalidateTags(['Notification']));
    };
    socket.on('notification:new',     onNew);
    socket.on('notification:read',    onNew);
    socket.on('notification:all-read', onNew);

    return () => {
      socket.off('notification:new',     onNew);
      socket.off('notification:read',    onNew);
      socket.off('notification:all-read', onNew);
    };
  }, [dispatch]);

  return (
    <div className="relative">
      <button className="btn btn--ghost btn--icon btn--md relative" onClick={() => setOpen(!open)}>
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--negative-color)] text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="dropdown-panel absolute right-0 top-12 w-80 max-h-96 overflow-y-auto z-[100]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
            <span className="text-sm font-medium">Notifications</span>
            {unreadCount > 0 && (
              <button className="text-xs text-[var(--primary-color)]" onClick={() => markAllRead()}>
                Mark all read
              </button>
            )}
          </div>

          {data?.data.length === 0 && (
            <div className="p-8 text-center text-sm text-[var(--secondary-text-color)]">
              No notifications yet
            </div>
          )}

          {data?.data.map(n => (
            <div
              key={n.id}
              className={`dropdown-item flex-col items-start gap-1 cursor-pointer ${!n.isRead ? 'bg-[var(--primary-background-hover-color)]' : ''}`}
              onClick={() => { markRead(n.id); if (n.actionUrl) navigate(n.actionUrl); }}
            >
              <div className="flex items-center gap-2 w-full">
                {!n.isRead && <span className="w-2 h-2 rounded-full bg-[var(--primary-color)] flex-shrink-0" />}
                <span className="text-sm font-medium text-[var(--primary-text-color)] flex-1">{n.title}</span>
              </div>
              <p className="text-xs text-[var(--secondary-text-color)] line-clamp-2 pl-4">{n.body}</p>
              <span className="text-xs text-[var(--text-tertiary)] pl-4">{formatRelative(n.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## Checklist

- [ ] `Notification` model has `@@index([userId, isRead])` for fast unread count queries
- [ ] `NotificationService.send()` adds to queue — never creates DB record synchronously in the API request
- [ ] Worker persists notification AND emits socket event in one step
- [ ] Bell icon updates count via socket — no polling
- [ ] `markRead` and `markAllRead` both emit socket events to keep other tabs in sync
- [ ] `actionUrl` on notification enables deep linking to the related record
- [ ] Unread count badge shows `99+` for large counts (not `128`)
- [ ] Clicking a notification marks it read AND navigates to `actionUrl`
