import { api } from '@/app/api';
import { unwrapEnvelope } from '@/lib/apiError';
import type { IncidentSummary } from '@/types/vms';

// Per-user notification-bell API. The feed is the caller's recent in-scope
// incidents (same IncidentSummary shape features/overview already uses) each
// tagged with THIS user's read state from the IncidentReadReceipt table. Real
// backend: backend/src/modules/notifications/notification-read.{router,
// service}.ts, mounted at /api/notifications/me. Every row and write is filtered
// through the caller's UserAccessScope and keyed to the authenticated user, so a
// user can only read/mutate their OWN notification state.
export interface NotificationItem extends IncidentSummary {
  /** True once this user has a read receipt for the incident. */
  isRead: boolean;
  /** ISO timestamp of the read receipt, or null while unread. */
  readAt: string | null;
}

/** GET /notifications/me/unread-count — badge count (may exceed the feed). */
export interface NotificationUnreadCount {
  count: number;
}

/** POST mark-one / mark-all — authoritative post-write count + rows changed. */
export interface NotificationMarkResult {
  unreadCount: number;
  marked: number;
}

// Endpoint names are GLOBAL across the shared `api` (RTK keeps the FIRST
// registered under a name and silently ignores collisions — see the note in
// features/overview/overview.api.ts). admin.api.ts already owns
// `listAdminNotifications`, so these use distinct `Notification*`/feed wording.
//
// Split into two injectEndpoints calls ON PURPOSE: the mark-read mutations patch
// the query caches optimistically via `.util.updateQueryData('getNotificationFeed'
// …)`, which needs the query endpoint names to be known at that reference. Doing
// the queries first and referencing this already-typed handle from the mutations
// keeps that fully type-safe (referencing an api const inside its own
// injectEndpoints initializer makes its type circular / implicitly `any`).
const notificationsFeedApi = api
  .enhanceEndpoints({ addTagTypes: ['Notification'] })
  .injectEndpoints({
    endpoints: (builder) => ({
      // Dropdown feed — recent in-scope incidents tagged with this user's read
      // state. Envelope { success, data } unwrapped to NotificationItem[].
      getNotificationFeed: builder.query<NotificationItem[], void>({
        query: () => '/notifications/me',
        transformResponse: unwrapEnvelope<NotificationItem[]>,
        providesTags: [{ type: 'Notification' as const, id: 'FEED' }],
      }),

      // Badge count — genuine per-user unread total. Kept separate from the feed
      // because the feed is capped (NOTIFICATION_FEED_LIMIT) while the badge must
      // reflect the true count, so it can legitimately exceed the list ("99+").
      getNotificationUnreadCount: builder.query<NotificationUnreadCount, void>({
        query: () => '/notifications/me/unread-count',
        transformResponse: unwrapEnvelope<NotificationUnreadCount>,
        providesTags: [{ type: 'Notification' as const, id: 'UNREAD_COUNT' }],
      }),
    }),
  });

export const notificationsApi = notificationsFeedApi.injectEndpoints({
  endpoints: (builder) => ({
    // Mark ONE incident read. Optimistically flips the feed item + decrements the
    // badge for instant feedback, reconciles the badge to the server's
    // authoritative count on success, and rolls both patches back on failure.
    markNotificationRead: builder.mutation<NotificationMarkResult, string>({
      query: (incidentId) => ({
        url: `/notifications/me/${incidentId}/read`,
        method: 'POST',
      }),
      async onQueryStarted(incidentId, { dispatch, queryFulfilled }) {
        let wasUnread = false;
        const feedPatch = dispatch(
          notificationsFeedApi.util.updateQueryData('getNotificationFeed', undefined, (draft) => {
            const item = draft.find((n) => n.id === incidentId);
            if (item && !item.isRead) {
              wasUnread = true;
              item.isRead = true;
              item.readAt = new Date().toISOString();
            }
          })
        );
        // Only touch the badge if this incident was actually unread (the item may
        // be absent from the capped feed, or already read — a no-op either way).
        const countPatch = wasUnread
          ? dispatch(
              notificationsFeedApi.util.updateQueryData(
                'getNotificationUnreadCount',
                undefined,
                (draft) => {
                  if (draft.count > 0) draft.count -= 1;
                }
              )
            )
          : null;
        try {
          const { data } = await queryFulfilled;
          // Reconcile the badge to the server's post-write truth — corrects any
          // drift when the marked incident sat outside the capped feed window.
          dispatch(
            notificationsFeedApi.util.updateQueryData(
              'getNotificationUnreadCount',
              undefined,
              (draft) => {
                draft.count = data.unreadCount;
              }
            )
          );
        } catch {
          feedPatch.undo();
          countPatch?.undo();
        }
      },
    }),

    // Mark EVERY in-scope incident read. Optimistically flips all feed items +
    // zeroes the badge; rolls back on failure.
    markAllNotificationsRead: builder.mutation<NotificationMarkResult, void>({
      query: () => ({ url: '/notifications/me/read-all', method: 'POST' }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const now = new Date().toISOString();
        const feedPatch = dispatch(
          notificationsFeedApi.util.updateQueryData('getNotificationFeed', undefined, (draft) => {
            draft.forEach((n) => {
              if (!n.isRead) {
                n.isRead = true;
                n.readAt = now;
              }
            });
          })
        );
        const countPatch = dispatch(
          notificationsFeedApi.util.updateQueryData(
            'getNotificationUnreadCount',
            undefined,
            (draft) => {
              draft.count = 0;
            }
          )
        );
        try {
          await queryFulfilled;
        } catch {
          feedPatch.undo();
          countPatch.undo();
        }
      },
    }),
  }),
});

export const {
  useGetNotificationFeedQuery,
  useGetNotificationUnreadCountQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} = notificationsApi;
