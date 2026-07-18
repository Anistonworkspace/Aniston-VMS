import { z } from 'zod';
import { Channel, NotificationStatus } from '@prisma/client';
import { PaginationSchema, UuidParamSchema } from '@aniston-vms/shared';

// Admin API — read-only "delivery log" for outbound alerts. Field names match
// prisma/schema.prisma `model Notification` exactly (see notifications.service.ts).

export const notificationIdParamsSchema = UuidParamSchema;

export const notificationListQuerySchema = PaginationSchema.extend({
  incidentId: z.string().uuid().optional(),
  status: z.nativeEnum(NotificationStatus).optional(),
  channel: z.nativeEnum(Channel).optional(),
});
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
