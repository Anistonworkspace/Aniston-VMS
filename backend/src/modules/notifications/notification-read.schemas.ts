import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Request validation for the per-user notification-read API. Params only — the
// feed/unread-count/mark-all routes take no input beyond the authenticated user.
// ─────────────────────────────────────────────────────────────────────────────

/** `/notifications/me/:incidentId/read` — the incident being marked read. */
export const notificationReadParamsSchema = z.object({
  incidentId: z.string().uuid(),
});

export type NotificationReadParams = z.infer<typeof notificationReadParamsSchema>;
