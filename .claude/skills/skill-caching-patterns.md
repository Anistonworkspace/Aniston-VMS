# Skill — Caching Patterns (Redis + RTK Query)

Cache-aside from services, TTL strategy, invalidation on mutation, frontend query tuning.

---

## Backend — Redis cache utility

```typescript
// backend/src/lib/cache.ts
import { redisClient } from './redis.js';
import { logger } from './logger.js';

export const cache = {
  // Get or set — the main pattern
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds = 300,
  ): Promise<T> {
    try {
      const cached = await redisClient.get(key);
      if (cached) return JSON.parse(cached) as T;
    } catch (err) {
      logger.warn(`[Cache] Redis GET failed for ${key}`, { error: (err as Error).message });
    }

    const value = await factory();

    try {
      await redisClient.set(key, JSON.stringify(value), { EX: ttlSeconds });
    } catch (err) {
      logger.warn(`[Cache] Redis SET failed for ${key}`, { error: (err as Error).message });
    }

    return value;
  },

  // Delete one key
  async del(key: string): Promise<void> {
    try { await redisClient.del(key); }
    catch (err) { logger.warn(`[Cache] Redis DEL failed for ${key}`); }
  },

  // Delete by pattern (e.g. all keys for an org)
  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) await redisClient.del(keys);
    } catch (err) {
      logger.warn(`[Cache] Redis KEYS failed for pattern ${pattern}`);
    }
  },

  // Increment a counter (for rate limiting / unread counts)
  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const val = await redisClient.incr(key);
    if (ttlSeconds && val === 1) await redisClient.expire(key, ttlSeconds);
    return val;
  },
};
```

---

## Cache key conventions

```typescript
// backend/src/lib/cache-keys.ts
export const CacheKeys = {
  // Org-scoped — invalidate the whole set when any record in that org changes
  orgCategories:   (orgId: string)            => `org:${orgId}:categories`,
  orgTags:         (orgId: string)            => `org:${orgId}:tags`,
  orgItems:        (orgId: string)            => `org:${orgId}:items`,
  orgStats:        (orgId: string)            => `org:${orgId}:stats`,

  // Per-record — invalidate when that specific record changes
  item:            (orgId: string, id: string) => `org:${orgId}:item:${id}`,
  category:        (orgId: string, id: string) => `org:${orgId}:category:${id}`,

  // User-specific
  userPerms:       (userId: string)            => `user:${userId}:permissions`,
  userNotifCount:  (userId: string)            => `user:${userId}:notif-unread`,
} as const;
```

---

## TTL strategy by data type

| Data type | TTL | Reason |
|-----------|-----|--------|
| Static lists (categories, tags) | 15 min (900s) | Rarely changes |
| Dashboard stats / aggregations | 5 min (300s) | Acceptable staleness |
| Item list | 5 min | Changes on create/update |
| Single item record | 10 min | Infrequent changes |
| User permissions | 30 min | Role changes are rare |
| Notification unread count | No cache — use Redis counter | Needs real-time accuracy |
| Search results | No cache | Too many permutations |

---

## Service — cache-aside pattern

```typescript
// backend/src/modules/category/category.service.ts
import { cache } from '../../lib/cache.js';
import { CacheKeys } from '../../lib/cache-keys.js';

export class CategoryService {
  static async list(actor: AuthUser) {
    const key = CacheKeys.orgCategories(actor.organizationId);

    // Cache-aside: try cache first, fall back to DB
    return cache.getOrSet(
      key,
      () => prisma.category.findMany({
        where: { organizationId: actor.organizationId, deletedAt: null },
        orderBy: { name: 'asc' },
      }),
      900,  // 15-minute TTL
    );
  }

  static async create(dto: CreateCategoryInput, actor: AuthUser) {
    const category = await prisma.$transaction(async (tx) => {
      const c = await tx.category.create({
        data: { ...dto, organizationId: actor.organizationId },
      });
      await auditLogger.log(tx, { action: 'CATEGORY_CREATED', entityId: c.id, actorId: actor.id, organizationId: actor.organizationId });
      return c;
    });

    // Invalidate the list cache for this org
    await cache.del(CacheKeys.orgCategories(actor.organizationId));

    return category;
  }

  static async update(id: string, dto: UpdateCategoryInput, actor: AuthUser) {
    const category = await prisma.$transaction(async (tx) => { /* ... */ });

    // Invalidate both the list and the specific record
    await Promise.all([
      cache.del(CacheKeys.orgCategories(actor.organizationId)),
      cache.del(CacheKeys.item(actor.organizationId, id)),   // items include category name
    ]);

    return category;
  }

  static async remove(id: string, actor: AuthUser) {
    await prisma.$transaction(async (tx) => { /* soft delete */ });
    await cache.del(CacheKeys.orgCategories(actor.organizationId));
  }
}
```

---

## Dashboard stats caching (aggregate queries)

```typescript
static async getDashboardStats(actor: AuthUser) {
  const key = CacheKeys.orgStats(actor.organizationId);

  return cache.getOrSet(key, async () => {
    const [totalItems, pendingItems, totalCategories] = await prisma.$transaction([
      prisma.item.count({ where: { organizationId: actor.organizationId, deletedAt: null } }),
      prisma.item.count({ where: { organizationId: actor.organizationId, status: 'SUBMITTED', deletedAt: null } }),
      prisma.category.count({ where: { organizationId: actor.organizationId, deletedAt: null } }),
    ]);
    return { totalItems, pendingItems, totalCategories };
  }, 300);  // 5-minute TTL
}

// Invalidate stats whenever item data changes:
// await cache.del(CacheKeys.orgStats(actor.organizationId));
```

---

## Frontend — RTK Query cache tuning

```typescript
// Tune keepUnusedDataFor per endpoint based on how frequently data changes

getItems: builder.query({
  query: (params) => ({ url: '/items', params }),
  providesTags: ['Item'],
  keepUnusedDataFor: 60,        // keep for 60s after component unmounts (default)
}),

// Static/rarely-changing data — keep much longer
getCategories: builder.query({
  query: () => '/categories',
  providesTags: ['Category'],
  keepUnusedDataFor: 900,       // 15 min — matches server-side TTL
}),

// Real-time data — reduce staleness
getNotifications: builder.query({
  query: (params) => ({ url: '/notifications', params }),
  providesTags: ['Notification'],
  keepUnusedDataFor: 0,         // always refetch when navigating back
}),

// Dashboard stats — poll every 5 minutes
getDashboardStats: builder.query({
  query: () => '/dashboard/stats',
  providesTags: ['DashboardStats'],
  keepUnusedDataFor: 300,
}),
```

---

## Frontend — Forced refetch on focus / reconnect

```typescript
// RTK Query BaseAPI setup — refetch when user returns to tab
export const baseApi = createApi({
  refetchOnFocus:          true,   // refetch when tab regains focus
  refetchOnReconnect:      true,   // refetch on network reconnect
  refetchOnMountOrArgChange: 30,   // refetch if data is older than 30s when mounting
  // ...
});
```

---

## Redis counter for unread notifications (real-time accurate)

```typescript
// Instead of caching the count (stale), use a Redis counter
// Increment on new notification:
await redisClient.incr(`user:${userId}:notif-unread`);

// Decrement on read:
await redisClient.decr(`user:${userId}:notif-unread`);

// Zero on mark-all-read:
await redisClient.set(`user:${userId}:notif-unread`, '0');

// Read count without hitting DB:
const count = parseInt(await redisClient.get(`user:${userId}:notif-unread`) ?? '0', 10);
```

---

## Cache stampede prevention (for expensive queries)

```typescript
// Use a lock to prevent multiple requests hitting the DB simultaneously
import { redisClient } from './redis.js';

async function getOrSetWithLock<T>(key: string, factory: () => Promise<T>, ttl: number): Promise<T> {
  const cached = await redisClient.get(key);
  if (cached) return JSON.parse(cached) as T;

  const lockKey = `${key}:lock`;
  const locked  = await redisClient.set(lockKey, '1', { NX: true, EX: 5 });  // 5s lock

  if (!locked) {
    // Another request is computing — wait and retry
    await new Promise(r => setTimeout(r, 100));
    return getOrSetWithLock(key, factory, ttl);
  }

  try {
    const value = await factory();
    await redisClient.set(key, JSON.stringify(value), { EX: ttl });
    return value;
  } finally {
    await redisClient.del(lockKey);
  }
}
```

---

## Checklist

- [ ] Cache keys defined in `CacheKeys` object (typed, no magic strings)
- [ ] Every create/update/delete invalidates the relevant cache key(s)
- [ ] Static data (categories, tags) cached for 15 min
- [ ] Aggregate stats cached for 5 min
- [ ] Search results NOT cached (too many permutations)
- [ ] Redis failures are logged as WARN, not thrown as errors (graceful degradation)
- [ ] RTK Query `keepUnusedDataFor` tuned per endpoint
- [ ] `refetchOnFocus: true` on the base API
- [ ] Real-time counters (notifications) use Redis INCR/DECR, not a cached query
