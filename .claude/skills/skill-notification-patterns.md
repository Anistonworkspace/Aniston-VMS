# Skill — Notification System Patterns

Full lifecycle: enqueue on BullMQ → worker persists + delivers (WhatsApp / Email via SES / in-app socket push) → bell icon → mark as read. Delivery is channel-abstracted, template-rendered, retried on failure, status-tracked, and deduped so the same alert doesn't storm a user's inbox.

> Canon: `docs/03-app-flow.md` (notification triggers across user flows) · `docs/05-backend-schema.md` (`Notification` model + enums). Skim, don't re-derive.

---

## Prisma model

```prisma
// prisma/schema.prisma — add these
enum NotificationChannel {
  IN_APP    // socket push only, no external delivery
  EMAIL     // Amazon SES
  WHATSAPP  // WhatsApp Business API
}

enum NotificationStatus {
  PENDING
  SENT
  DELIVERED
  FAILED
}

model Notification {
  id             String              @id @default(uuid())
  organizationId String
  userId         String              // recipient

  type           String              // e.g. 'CAMERA_OFFLINE', 'RECORDING_FAILED' — see NotificationType
  channel        NotificationChannel @default(IN_APP)
  status         NotificationStatus  @default(PENDING)

  title          String
  body           String
  isRead         Boolean             @default(false)
  readAt         DateTime?

  entityId       String?             // the record this notification is about
  entityType     String?             // 'Camera', 'Recording', 'Export', etc.
  actionUrl      String?             // deep link, e.g. /cameras/:id

  dedupeKey      String?             // e.g. `camera-offline:${cameraId}` — guards against alert storms
  sentAt         DateTime?
  failedReason   String?

  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  deletedAt      DateTime?

  user           User         @relation(fields: [userId], references: [id], onDelete: Restrict)
  organization   Organization @relation(fields: [organizationId], references: [id])

  @@unique([organizationId, dedupeKey], name: "uq_notification_dedupe") // idempotency: null dedupeKey never conflicts
  @@index([organizationId])
  @@index([userId])
  @@index([userId, isRead])         // for fetching unread count efficiently
  @@index([createdAt])
}
```

---

## Shared enums

```typescript
// libs/shared/src/enums.ts — add to existing enums
export enum NotificationType {
  CAMERA_OFFLINE   = 'CAMERA_OFFLINE',
  CAMERA_ONLINE    = 'CAMERA_ONLINE',
  RECORDING_FAILED = 'RECORDING_FAILED',
  STORAGE_LOW      = 'STORAGE_LOW',
  MOTION_DETECTED  = 'MOTION_DETECTED',
  EXPORT_READY     = 'EXPORT_READY',
  SYSTEM           = 'SYSTEM',
}

export enum NotificationChannel {
  IN_APP   = 'IN_APP',
  EMAIL    = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
}

export enum NotificationStatus {
  PENDING   = 'PENDING',
  SENT      = 'SENT',
  DELIVERED = 'DELIVERED',
  FAILED    = 'FAILED',
}
```

---

## Notification service (NestJS)

```typescript
// apps/api/src/modules/notifications/dto/create-notification.dto.ts
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { NotificationType, NotificationChannel } from '@aniston-vms/shared';

export class CreateNotificationDto {
  @IsUUID() organizationId!: string;
  @IsUUID() userId!: string;
  @IsEnum(NotificationType) type!: NotificationType;
  @IsOptional() @IsEnum(NotificationChannel) channel?: NotificationChannel;
  @IsString() title!: string;
  @IsString() body!: string;
  @IsOptional() @IsUUID() entityId?: string;
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() actionUrl?: string;
  @IsOptional() @IsString() dedupeKey?: string;
}
```

```typescript
// apps/api/src/modules/notifications/notifications.service.ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationChannel, type AuthUser } from '@aniston-vms/shared';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  // ── Send a notification (called by other services, e.g. CameraHealthService) ──
  async send(dto: CreateNotificationDto) {
    const { organizationId, dedupeKey } = dto;

    // Idempotency: don't re-queue an alert already raised for the same entity
    if (dedupeKey) {
      const existing = await this.prisma.notification.findUnique({
        where: { organizationId_dedupeKey: { organizationId, dedupeKey } },
      });
      if (existing) return existing;
    }

    // Queue only — the worker persists the row AND delivers on the chosen channel.
    // Never write the DB record synchronously inside the request/response cycle.
    return this.notificationsQueue.add(
      'deliver',
      { ...dto, channel: dto.channel ?? NotificationChannel.IN_APP },
      { attempts: 3, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: true },
    );
  }

  // ── List notifications for the current user ──────────────────────────────
  async list(actor: AuthUser, page = 1, limit = 20) {
    const where = { userId: actor.id, organizationId: actor.organizationId, deletedAt: null };

    const [data, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...where, isRead: false } }),
    ]);

    return { data, meta: { page, limit, total, unreadCount } };
  }

  // ── Mark one as read ─────────────────────────────────────────────────────
  async markRead(id: string, actor: AuthUser) {
    await this.prisma.notification.updateMany({
      where: { id, userId: actor.id, organizationId: actor.organizationId },
      data: { isRead: true, readAt: new Date() },
    });
    this.gateway.emitToUser(actor.id, 'notification:read', { id });
  }

  // ── Mark all as read ─────────────────────────────────────────────────────
  async markAllRead(actor: AuthUser) {
    await this.prisma.notification.updateMany({
      where: { userId: actor.id, organizationId: actor.organizationId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    this.gateway.emitToUser(actor.id, 'notification:all-read', {});
  }
}
```

```typescript
// apps/api/src/modules/notifications/notifications.controller.ts — scope-guarded RBAC
@UseGuards(JwtAuthGuard, ScopeGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @RequireScope('notifications:read')
  list(@CurrentUser() actor: AuthUser, @Query('page') page?: number) {
    return this.notifications.list(actor, page);
  }

  @Patch(':id/read')
  @RequireScope('notifications:read')
  markRead(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.notifications.markRead(id, actor);
  }

  @Patch('read-all')
  @RequireScope('notifications:read')
  markAllRead(@CurrentUser() actor: AuthUser) {
    return this.notifications.markAllRead(actor);
  }
}
```

---

## BullMQ delivery worker

```typescript
// apps/workers/src/notifications/notifications.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';         // Amazon SES
import { WhatsAppService } from '../whatsapp/whatsapp.service';  // WhatsApp Business API
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { NotificationChannel, NotificationStatus } from '@aniston-vms/shared';

@Processor('notifications')
export class NotificationsProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly whatsapp: WhatsAppService,
    private readonly gateway: NotificationsGateway,
  ) {
    super();
  }

  async process(job: Job) {
    const { organizationId, userId, type, title, body, entityId, entityType, actionUrl, channel, dedupeKey } = job.data;

    // Persist first so the bell icon has a row even if the external channel below fails
    const notification = await this.prisma.notification.create({
      data: { organizationId, userId, type, title, body, entityId, entityType, actionUrl, channel, dedupeKey, status: NotificationStatus.PENDING },
    });

    try {
      switch (channel) {
        case NotificationChannel.EMAIL:
          await this.email.send({ userId, template: type, data: { title, body, actionUrl } }); // renders the template mapped to `type`
          break;
        case NotificationChannel.WHATSAPP:
          await this.whatsapp.sendTemplate({ userId, template: type, params: { title, body } });
          break;
        case NotificationChannel.IN_APP:
        default:
          break; // socket push below is the delivery for this channel
      }
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.SENT, sentAt: new Date() },
      });
    } catch (err) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.FAILED, failedReason: (err as Error).message },
      });
      throw err; // rethrow so BullMQ applies the job's retry/backoff policy
    }

    // Real-time push regardless of channel, so the bell icon updates live
    this.gateway.emitToUser(userId, 'notification:new', notification);
  }
}
```

---

## How other services send notifications

```typescript
// apps/api/src/modules/cameras/camera-health.service.ts
await this.notifications.send({
  organizationId: camera.organizationId,
  userId: camera.ownerId,
  type: NotificationType.CAMERA_OFFLINE,
  channel: NotificationChannel.WHATSAPP,
  title: 'Camera offline',
  body: `${camera.name} at ${camera.location} stopped responding.`,
  entityId: camera.id,
  entityType: 'Camera',
  actionUrl: `/cameras/${camera.id}`,
  dedupeKey: `camera-offline:${camera.id}`, // re-pinging the same offline camera won't spam the user
});
```

---

## RTK Query API slice

```typescript
// frontend/src/features/notifications/notificationApi.ts
import type { Notification, PaginatedResponse } from '@aniston-vms/shared';

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
import { getSocket } from '@/lib/socket'; // connects to the NestJS NotificationsGateway (socket.io adapter)
import { notificationApi } from '@/features/notifications/notificationApi';
import { useDispatch } from 'react-redux';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const dispatch = useDispatch();
  const { data } = useGetNotificationsQuery({});
  const [markRead]    = useMarkReadMutation();
  const [markAllRead] = useMarkAllReadMutation();

  const unreadCount = data?.meta?.unreadCount ?? 0;

  // Listen for real-time pushes from NotificationsGateway (in-app channel)
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onNew = () => {
      dispatch(notificationApi.util.invalidateTags(['Notification']));
    };
    socket.on('notification:new',      onNew);
    socket.on('notification:read',     onNew);
    socket.on('notification:all-read', onNew);

    return () => {
      socket.off('notification:new',      onNew);
      socket.off('notification:read',     onNew);
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
- [ ] `NotificationsService.send()` adds to the BullMQ queue — never creates the DB record synchronously inside the request
- [ ] `NotificationsProcessor` (`apps/workers`) persists the row, delivers on the requested `channel`, and updates `status` — in that order
- [ ] `dedupeKey` + the `[organizationId, dedupeKey]` unique index prevent alert storms (e.g. repeated `camera-offline` pings)
- [ ] Every controller route sits behind `JwtAuthGuard` + `ScopeGuard`, and every Prisma query is scoped by `organizationId`
- [ ] Bell icon updates count via the `NotificationsGateway` socket push — no polling
- [ ] `markRead` and `markAllRead` both emit socket events to keep other tabs/devices in sync
- [ ] `actionUrl` on a notification enables deep linking to the related record (e.g. `/cameras/:id`)
- [ ] Unread count badge shows `99+` for large counts, never the raw number
- [ ] Failed EMAIL/WHATSAPP deliveries set `status: FAILED` + `failedReason` and rethrow so BullMQ's retry/backoff policy applies
