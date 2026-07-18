# Skill — Caching Patterns (Redis + RTK Query)

Cache-aside from services, TTL strategy, invalidation on mutation, frontend query tuning.
Read `docs/02-TRD.md` (Redis 7 sizing/queues) and `docs/05-backend-schema.md` (tables named
below) first if anything here looks unfamiliar. See `skill-prisma-patterns.md` for the
mandatory zone-scope filter — every cached query below still has to be scoped before it's
ever cached, caching a leak just makes it faster.

---

## Backend — Redis cache utility

Aniston VMS shares **one Redis 7 instance** between the NestJS API's cache reads and the
`apps/workers` BullMQ queues (health probes, snapshot analysis, notification delivery, clip
exports). BullMQ owns everything under the `bull:*` namespace — cache code must never read or
delete those keys. Every cache key below is prefixed `cache:` so `KEYS`/`SCAN` cleanup, Redis
`INFO keyspace`, and on-call debugging can tell the two apart at a glance.

`apps/api/src/cache/redis-cache.service.ts`
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type Redis from 'ioredis';

@Injectable()
export class RedisCacheService {
  private readonly logger = new Logger(RedisCacheService.name);

  constructor(@InjectRedis() private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.redis.get(key);
      return cached ? (JSON.parse(cached) as T) : null;
    } catch (err) {
      this.logger.warn(`Redis GET failed for ${key}: ${(err as Error).message}`);
      return null; // degrade to a live DB read, never throw out of the cache layer
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`Redis SET failed for ${key}: ${(err as Error).message}`);
    }
  }

  async del(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    if (list.length === 0) return;
    try {
      await this.redis.del(list);
    } catch (err) {
      this.logger.warn(`Redis DEL failed for ${list.join(', ')}: ${(err as Error).message}`);
    }
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) await this.redis.del(keys);
    } catch (err) {
      this.logger.warn(`Redis KEYS failed for pattern ${pattern}: ${(err as Error).message}`);
    }
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const value = await this.redis.incr(key);
    if (ttlSeconds && value === 1) await this.redis.expire(key, ttlSeconds);
    return value;
  }

  async getOrSet<T>(key: string, ttlSeconds: number, factory: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }
}
```

## Cache key conventions

`apps/api/src/cache/cache-keys.ts`
```typescript
export const CacheKeys = {
  zoneCameras: (zoneId: string) => `cache:zone:${zoneId}:cameras`,
  siteCameras: (siteId: string) => `cache:site:${siteId}:cameras`,
  camera: (cameraId: string) => `cache:camera:${cameraId}`,
  fleetStats: (scopeHash: string) => `cache:fleet:stats:${scopeHash}`,
  zoneOpenIncidentCount: (zoneId: string) => `cache:zone:${zoneId}:open-incidents`,
  userScopes: (userId: string) => `cache:user:${userId}:scopes`,
} as const;
```

Naming: `cache:{scope}:{id}:{resource}[:{qualifier}]` — every key starts with the literal
`cache:` segment, never `bull:`. Invalidate the whole zone/site list when a camera inside it
changes rather than trying to patch one entry in a cached array; `fleetStats` is keyed by a
hash of the caller's *resolved* scope set (`'all'`, or a sorted, joined `zoneId` list) because
Aniston VMS has no `organizationId` — a `CLIENT_VIEWER` and a `SUPER_ADMIN` calling the same
endpoint never get the same numbers, so they must never share a cache key.

## TTL strategy

| Data | TTL | Reason |
|---|---|---|
| Fleet / zone dashboard stats | 300s (5 min) | Aggregated across `health_checks`; a few minutes of staleness on a tile is acceptable |
| Zone / site camera list | 900s (15 min) | Provisioning changes rarely — status flaps are read live, not from this cache |
| Single camera record | 60s (1 min) | `status` / `health_score` update on every probe cycle |
| User access scopes | 1800s (30 min) | `user_access_scopes` edits are rare, invalidated explicitly on RBAC change |
| Zone open-incident badge | not `getOrSet` — Redis counter (see below) | Must never undercount a live `CRITICAL` incident |
| Stream session / clip export status | not cached | Changes on every heartbeat or worker tick; a direct Postgres read is cheap and always correct |

## Service — cache-aside pattern

`apps/api/src/modules/camera/camera.service.ts`
```typescript
@Injectable()
export class CameraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    private readonly auditLogger: AuditLogger,
  ) {}

  async listByZone(zoneId: string, scope: AccessScope) {
    if (!scope.allowedZoneIds.includes(zoneId)) throw new ForbiddenException();
    return this.cache.getOrSet(CacheKeys.zoneCameras(zoneId), 900, () =>
      this.prisma.camera.findMany({
        where: { zoneId, deletedAt: null },
        orderBy: { name: 'asc' },
      }),
    );
  }

  async create(siteId: string, zoneId: string, dto: CreateCameraInput, actor: AuthUser) {
    const camera = await this.prisma.$transaction(async (tx) => {
      const created = await tx.camera.create({ data: { ...dto, siteId, status: 'UNKNOWN' } });
      await this.auditLogger.log(tx, {
        action: 'CAMERA_CREATED',
        entityType: 'camera',
        entityId: created.id,
        userId: actor.id,
      });
      return created;
    });
    // A stale list cache would hide the new camera from the fleet view for up to 15 minutes.
    await this.cache.del(CacheKeys.zoneCameras(zoneId));
    return camera;
  }

  async update(cameraId: string, zoneId: string, dto: UpdateCameraInput) {
    const camera = await this.prisma.camera.update({ where: { id: cameraId }, data: dto });
    // Invalidate both the specific record and the list it lives in.
    await this.cache.del([CacheKeys.camera(cameraId), CacheKeys.zoneCameras(zoneId)]);
    return camera;
  }

  async softDelete(cameraId: string, zoneId: string) {
    await this.prisma.camera.update({ where: { id: cameraId }, data: { deletedAt: new Date() } });
    await this.cache.del([CacheKeys.camera(cameraId), CacheKeys.zoneCameras(zoneId)]);
  }
}
```

## Dashboard stats caching

```typescript
async getFleetStats(scope: AccessScope) {
  const scopeHash = hashScope(scope); // 'all', or a stable hash of the sorted allowedZoneIds
  return this.cache.getOrSet(CacheKeys.fleetStats(scopeHash), 300, async () => {
    const zoneFilter = scope.allowedZoneIds ? { zoneId: { in: scope.allowedZoneIds } } : {};
    const [total, healthy, warning, critical, openIncidents] = await this.prisma.$transaction([
      this.prisma.camera.count({ where: { ...zoneFilter, deletedAt: null } }),
      this.prisma.camera.count({ where: { ...zoneFilter, deletedAt: null, status: 'HEALTHY' } }),
      this.prisma.camera.count({ where: { ...zoneFilter, deletedAt: null, status: 'WARNING' } }),
      this.prisma.camera.count({ where: { ...zoneFilter, deletedAt: null, status: 'CRITICAL' } }),
      this.prisma.incident.count({ where: { ...zoneFilter, status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
    ]);
    return { total, healthy, warning, critical, openIncidents };
  });
}
```

There is deliberately no invalidation hook here. `camera.status` is written continuously by
BullMQ health-probe workers, so event-driven invalidation would thrash this cache dozens of
times a minute for no visible benefit. The flat 5-minute TTL is the trade-off: dashboard tiles
can lag reality by up to 5 minutes — the incident feed and camera detail view, which are never
cached this way, cannot.

## Frontend — RTK Query cache tuning

```typescript
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  tagTypes: ['Camera', 'Incident'],
  endpoints: (builder) => ({
    getCamerasByZone: builder.query<Camera[], string>({
      query: (zoneId) => `/zones/${zoneId}/cameras`,
      providesTags: ['Camera'],
      keepUnusedDataFor: 300,
    }),
    updateCamera: builder.mutation<Camera, { id: string; body: UpdateCameraInput }>({
      query: ({ id, body }) => ({ url: `/cameras/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Camera'],
    }),
    getFleetStats: builder.query<FleetStats, void>({
      query: () => '/dashboard/stats',
      keepUnusedDataFor: 60,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    }),
    getIncidents: builder.query<Incident[], { status?: IncidentStatus }>({
      query: (params) => ({ url: '/incidents', params }),
      keepUnusedDataFor: 30,
      refetchOnMountOrArgChange: true,
      providesTags: ['Incident'],
    }),
  }),
});
```

Live-feeling data (fleet stats, the incident feed) gets a short `keepUnusedDataFor` plus
`refetchOnFocus` / `refetchOnReconnect`, so an operator returning to a backgrounded tab, or
reconnecting after the live-view WebSocket drops, sees current camera health instead of a
stale snapshot. Slow-changing reference data (zone/site camera lists) gets a longer
`keepUnusedDataFor` and is invalidated by tag on mutation instead of polling.

## Real-time incident badge counter

The unacknowledged-incident badge is never routed through `getOrSet` — it's a plain Redis
counter, incremented and decremented in lockstep with `incidents.status` transitions, because
undercounting a live `CRITICAL` incident is worse than an occasional cache miss:

```typescript
// Called by the escalation worker once an incident reaches ALERTED
async onIncidentAlerted(zoneId: string): Promise<void> {
  await this.cache.incr(CacheKeys.zoneOpenIncidentCount(zoneId));
}

// Called from the acknowledge/resolve endpoints
async onIncidentAcknowledged(zoneId: string): Promise<void> {
  const key = CacheKeys.zoneOpenIncidentCount(zoneId);
  const remaining = await this.redis.decr(key);
  if (remaining < 0) await this.redis.set(key, '0'); // never show a negative badge
}

async getOpenIncidentBadge(scope: AccessScope): Promise<number> {
  const zoneIds = scope.allowedZoneIds ?? (await this.prisma.zone.findMany({ select: { id: true } })).map((z) => z.id);
  const counts = await Promise.all(zoneIds.map((id) => this.redis.get(CacheKeys.zoneOpenIncidentCount(id))));
  return counts.reduce((sum: number, value) => sum + (value ? parseInt(value, 10) : 0), 0);
}
```

## Cache stampede prevention

Fleet stats and zone camera lists are read on every dashboard load. If a TTL expires while
several `PROJECT_ADMIN` browsers are open at once, a naive cache-aside call fires the same
expensive aggregate query multiple times in the same second. Take a short-lived lock and make
the losers wait for the winner's result instead of racing Postgres:

```typescript
async getOrSetWithLock<T>(key: string, ttlSeconds: number, factory: () => Promise<T>): Promise<T> {
  const cached = await this.get<T>(key);
  if (cached !== null) return cached;

  const lockKey = `cache:lock:${key}`;
  const acquired = await this.redis.set(lockKey, '1', 'NX', 'EX', 5);
  if (!acquired) {
    // Someone else is already computing this value — back off and retry.
    await new Promise((resolve) => setTimeout(resolve, 100));
    return this.getOrSetWithLock(key, ttlSeconds, factory);
  }
  try {
    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  } finally {
    await this.redis.del(lockKey);
  }
}
```

## Checklist

- [ ] Cache keys built from `CacheKeys`, never string-templated inline
- [ ] Every mutation that touches a cached table also invalidates the matching key(s)
- [ ] TTL is explicit and justified — nothing is cached "forever"
- [ ] Every key uses the `cache:` prefix and never collides with BullMQ's `bull:*` namespace
- [ ] Scope-sensitive results (fleet stats, camera lists) are keyed by the caller's resolved
      zone scope — never shared between a `CLIENT_VIEWER` and a `SUPER_ADMIN`
- [ ] Redis failures are logged and degrade to a direct Postgres read, never thrown to the caller
- [ ] Counters that must stay exact (the open-incident badge) use Redis `INCR`/`DECR`, not `getOrSet`
