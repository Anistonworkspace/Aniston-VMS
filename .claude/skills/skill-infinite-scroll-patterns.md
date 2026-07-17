# Skill — Infinite Scroll Patterns

Intersection Observer, RTK Query cursor pagination, virtual list for large datasets.

---

## Backend — cursor pagination

```typescript
// Cursor pagination for infinite scroll — more efficient than OFFSET for large datasets
// The cursor is the `id` of the last item in the previous page

export class ActivityService {
  static async list(query: InfiniteListQuery, actor: AuthUser) {
    const { cursor, limit = 20 } = query;

    const items = await prisma.activityLog.findMany({
      where: {
        organizationId: actor.organizationId,
        // If cursor provided: only items AFTER the cursor
        ...(cursor ? { id: { lt: cursor } } : {}),    // UUID v4 sorts lexicographically
      },
      orderBy: { createdAt: 'desc' },
      take:    limit + 1,    // fetch one extra to detect if there's a next page
    });

    const hasMore   = items.length > limit;
    const data      = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return { data, nextCursor, hasMore };
  }
}

// Validation schema:
export const InfiniteListQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
});
```

---

## RTK Query — infinite scroll endpoint

```typescript
// frontend/src/features/activity/activityApi.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

interface InfiniteActivityResult {
  data:       ActivityItem[];
  nextCursor: string | null;
  hasMore:    boolean;
}

export const activityApi = createApi({
  reducerPath: 'activityApi',
  baseQuery:   fetchBaseQuery({ baseUrl: '/api' }),
  endpoints: (builder) => ({
    getActivities: builder.query<InfiniteActivityResult, { cursor?: string; limit?: number }>({
      query: (params) => ({ url: '/activities', params }),
      // Merge pages — new page appended to existing data
      serializeQueryArgs: ({ endpointName }) => endpointName,    // single cache key
      merge: (currentCache, newItems) => {
        currentCache.data.push(...newItems.data);
        currentCache.nextCursor = newItems.nextCursor;
        currentCache.hasMore    = newItems.hasMore;
      },
      forceRefetch: ({ currentArg, previousArg }) => currentArg !== previousArg,
      providesTags: ['Activity'],
    }),
  }),
});

export const { useGetActivitiesQuery } = activityApi;
```

---

## Intersection Observer hook

```typescript
// frontend/src/hooks/useIntersectionObserver.ts
import { useEffect, useRef, useState } from 'react';

export function useIntersectionObserver(options?: IntersectionObserverInit) {
  const ref       = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting);
    }, { threshold: 0.1, ...options });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}
```

---

## Infinite scroll list component

```typescript
// frontend/src/features/activity/ActivityFeed.tsx
import { useEffect, useState } from 'react';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import { useGetActivitiesQuery } from './activityApi';

export function ActivityFeed() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const { ref, isVisible }  = useIntersectionObserver();

  const { data, isFetching } = useGetActivitiesQuery({ cursor, limit: 20 });

  // When the sentinel comes into view, load the next page
  useEffect(() => {
    if (isVisible && data?.hasMore && !isFetching) {
      setCursor(data.nextCursor ?? undefined);
    }
  }, [isVisible, data?.hasMore, data?.nextCursor, isFetching]);

  return (
    <div className="space-y-3">
      {(data?.data ?? []).map(item => (
        <ActivityCard key={item.id} item={item} />
      ))}

      {/* Sentinel element — observed by IntersectionObserver */}
      {data?.hasMore && (
        <div ref={ref} className="py-4 flex justify-center">
          {isFetching ? (
            <div className="flex gap-2">
              {[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-[var(--primary-color)] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
            </div>
          ) : (
            <span className="text-xs text-[var(--secondary-text-color)]">Scroll for more</span>
          )}
        </div>
      )}

      {!data?.hasMore && (data?.data.length ?? 0) > 0 && (
        <p className="text-center text-xs text-[var(--secondary-text-color)] py-4">All caught up</p>
      )}
    </div>
  );
}
```

---

## Virtual list for very large datasets (react-virtual)

```typescript
// For lists with 1000+ items — use virtualizer to render only visible rows
import { useVirtualizer } from '@tanstack/react-virtual';

export function VirtualItemList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count:         items.length,
    getScrollElement: () => parentRef.current,
    estimateSize:  () => 64,   // estimated row height in px
    overscan:      5,          // render 5 extra rows above/below visible area
  });

  return (
    <div ref={parentRef} className="overflow-y-auto" style={{ height: '600px' }}>
      {/* Total height spacer — lets browser scroll correctly */}
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index];
          return (
            <div
              key={virtualItem.key}
              style={{
                position:  'absolute',
                top:       0,
                transform: `translateY(${virtualItem.start}px)`,
                width:     '100%',
                height:    `${virtualItem.size}px`,
              }}
              className="flex items-center px-4 gap-3 border-b border-[var(--ui-bg-border-color)]"
            >
              <Avatar name={`${item.firstName} ${item.lastName}`} />
              <div>
                <p className="text-sm font-medium">{item.firstName} {item.lastName}</p>
                <p className="text-xs text-[var(--secondary-text-color)]">{item.email}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

---

## Refresh — reset to first page

```typescript
// Reset infinite scroll when filters change
function ActivityFeedWithFilters() {
  const [filter, setFilter] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  // When filter changes, reset to page 1
  const handleFilterChange = (newFilter: string) => {
    setFilter(newFilter);
    setCursor(undefined);    // ← reset cursor to reload from beginning
    // Also need to reset the RTK Query cache for this endpoint:
    dispatch(activityApi.util.resetApiState());
  };

  // ...
}
```

---

## Checklist

- [ ] Cursor-based pagination — NOT offset pagination (more efficient at scale)
- [ ] Backend: `take: limit + 1` to determine `hasMore` without extra COUNT query
- [ ] RTK Query `merge` function appends new pages to existing cache (not replaces)
- [ ] Sentinel div observed with `IntersectionObserver` — no scroll event listeners
- [ ] Loading indicator shown while fetching next page (not a spinner that causes layout shift)
- [ ] "All caught up" message shown when `hasMore` is false
- [ ] Filter/search change resets cursor to `undefined` and clears cache
- [ ] Virtual list used when dataset exceeds ~500 rows (react-virtual or @tanstack/react-virtual)
- [ ] `estimateSize` returns a reasonable row height to prevent scroll jumps
- [ ] Pull-to-refresh supported on mobile (resets cursor)
