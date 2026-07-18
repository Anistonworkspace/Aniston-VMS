# Skill — Infinite Scroll Patterns

Intersection Observer, RTK Query cursor pagination, virtual list for large camera/incident datasets.

Design tokens: see `docs/04-uiux-brief.md`.

---

## Backend — cursor pagination (incident activity log)

```ts
// backend/src/modules/activity/activity.service.ts
import { z } from 'zod';

export const InfiniteListQuerySchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  zoneId: z.string().uuid().optional(),
  incidentId: z.string().optional(),
});

export async function getActivities(organizationId: string, params: z.infer<typeof InfiniteListQuerySchema>) {
  const rows = await prisma.activityLog.findMany({
    where: { organizationId, zoneId: params.zoneId, incidentId: params.incidentId },
    orderBy: { createdAt: 'desc' },
    take: params.limit + 1,
    ...(params.cursor && { cursor: { createdAt: new Date(params.cursor) }, skip: 1 }),
  });

  const hasMore = rows.length > params.limit;
  const items = hasMore ? rows.slice(0, -1) : rows;
  const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;
  return { items, nextCursor, hasMore };
}
```

Cursor is `createdAt` (indexed, monotonic) — never `OFFSET`, which drifts and duplicates rows once new activity is streaming in live from health checks.

## RTK Query — infinite cache merge

```ts
// frontend/src/features/activity/activityApi.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const activityApi = createApi({
  reducerPath: 'activityApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  tagTypes: ['Activity'],
  endpoints: (builder) => ({
    getActivities: builder.query<InfiniteActivityResult, { zoneId?: string; incidentId?: string; cursor?: string }>({
      query: (filter) => ({ url: '/activity', params: filter }),
      serializeQueryArgs: ({ endpointName, queryArgs }) => `${endpointName}-${queryArgs.zoneId ?? 'all'}-${queryArgs.incidentId ?? 'all'}`,
      merge: (currentCache, newItems) => {
        currentCache.items.push(...newItems.items);
        currentCache.nextCursor = newItems.nextCursor;
        currentCache.hasMore = newItems.hasMore;
      },
      forceRefetch: ({ currentArg, previousArg }) => currentArg?.cursor !== previousArg?.cursor,
      providesTags: ['Activity'],
    }),
  }),
});
```

`serializeQueryArgs` keys the cache by **filter**, not by `cursor` — otherwise every page fetch creates a brand-new cache bucket instead of appending. Switching `zoneId` (jumping to a different zone's feed) resets to page one automatically because it's a different cache key entirely.

## Frontend — Intersection Observer sentinel

```tsx
// frontend/src/features/activity/ActivityFeed.tsx
import { useEffect, useRef, useState } from 'react';
import { useGetActivitiesQuery } from './activityApi';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import { ActivityListCard, ActivityListCardSkeleton } from '@/components/ActivityListCard';
import { EmptyState } from '@/components/EmptyState';

export function ActivityFeed({ zoneId, incidentId }: { zoneId?: string; incidentId?: string }) {
  const [cursor, setCursor] = useState<string | undefined>();
  const { data, isFetching } = useGetActivitiesQuery({ zoneId, incidentId, cursor });
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isVisible = useIntersectionObserver(sentinelRef, { rootMargin: '200px' });

  useEffect(() => {
    if (isVisible && data?.hasMore && !isFetching) setCursor(data.nextCursor ?? undefined);
  }, [isVisible, data?.hasMore, data?.nextCursor, isFetching]);

  return (
    <div className="space-y-2">
      {data?.items.map((activity) => (
        <ActivityListCard key={activity.id} activity={activity} />
      ))}
      <div ref={sentinelRef} className="h-4" />
      {isFetching && <ActivityListCardSkeleton count={3} />}
      {!isFetching && !data?.hasMore && data?.items.length === 0 && (
        <EmptyState icon={ActivityIcon} title="No activity yet" description="Health checks, acknowledgements, and status changes will show up here." />
      )}
    </div>
  );
}
```

```ts
// frontend/src/hooks/useIntersectionObserver.ts
import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

export function useIntersectionObserver(ref: RefObject<Element>, opts: IntersectionObserverInit = {}) {
  const [isIntersecting, setIsIntersecting] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setIsIntersecting(entry.isIntersecting), opts);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, opts.root, opts.rootMargin, opts.threshold]);
  return isIntersecting;
}
```

`rootMargin: '200px'` prefetches the next page before the sentinel is actually on screen — the feed never shows visible jank at the exact bottom edge.

## Virtual list — camera inventory at scale (1,000+ cameras)

A single organization's camera table can outgrow "just render every row." Pair the fetch with `@tanstack/react-virtual` so the DOM only holds visible rows regardless of how many pages have been fetched.

```tsx
// frontend/src/features/camera/CameraVirtualList.tsx
import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export function CameraVirtualList({ cameras }: { cameras: Camera[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: cameras.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 8,
  });

  return (
    <div ref={parentRef} className="h-[600px] overflow-auto rounded-[var(--card-radius)] border border-[var(--hairline)]">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: virtualItem.size, transform: `translateY(${virtualItem.start}px)` }}
          >
            <CameraRow camera={cameras[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Checklist

- [ ] Backend cursor is an indexed, monotonic column (`createdAt` + tiebreak `id`) — never `OFFSET/LIMIT` on a live-updating table
- [ ] `serializeQueryArgs` keys the RTK Query cache by filter (zone/incident), not by cursor — pages append, filter changes reset to page one
- [ ] Sentinel `rootMargin` gives at least one screen-height of lookahead so the next page is ready before the user reaches bottom
- [ ] Skeleton rows shown while fetching the next page — never a full-page spinner replacing already-loaded content
- [ ] Empty state (`ActivityFeed` with zero rows) is visually distinct from "still loading first page"
- [ ] Large lists (1,000+ cameras) use `@tanstack/react-virtual` — DOM node count stays roughly constant regardless of fetched item count
- [ ] `IntersectionObserver` disconnected on unmount — no leaked observers when navigating away mid-scroll
- [ ] Live-updating feeds (new incident activity arriving via socket) prepend without disturbing scroll position
- [ ] `organizationId` scoping present on the backend query — one tenant's activity feed never bleeds into another's