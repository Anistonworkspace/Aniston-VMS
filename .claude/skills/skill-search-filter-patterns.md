# Skill — Search, Filter, and Sort Patterns

One unified query builder pattern for every list endpoint (cameras, incidents, zones). Never write ad-hoc
WHERE clauses per module — extend the shared base schema and reuse the same filter-bar mechanics on the
frontend.

---

## Backend — Validation schema (shared)

```typescript
// shared/src/schemas/common.schema.ts — extend these for each module
import { z } from 'zod';

export const SortOrderSchema = z.enum(['asc', 'desc']).default('desc');

export const BaseListQuerySchema = z.object({
  page:    z.coerce.number().int().min(1).default(1),
  limit:   z.coerce.number().int().min(1).max(100).default(20),
  search:  z.string().trim().max(200).optional(),
  from:    z.string().datetime().optional(),  // ISO 8601
  to:      z.string().datetime().optional(),
  sortBy:  z.string().optional(),
  sortDir: SortOrderSchema,
});

// Camera list — filter by zone and health status
export const CameraListSchema = BaseListQuerySchema.extend({
  status:     z.enum(['HEALTHY', 'WARNING', 'CRITICAL', 'MAINTENANCE', 'UNKNOWN']).optional(),
  zoneId:     z.string().uuid().optional(),
  protocol:   z.enum(['RTSP', 'ONVIF']).optional(),
  sortBy:     z.enum(['createdAt', 'name', 'status']).default('createdAt'),
});
export type CameraListQuery = z.infer<typeof CameraListSchema>;

// Incident list — same shape, different enum + an extra severity filter
export const IncidentListSchema = BaseListQuerySchema.extend({
  status:     z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']).optional(),
  severity:   z.enum(['WARNING', 'CRITICAL']).optional(),
  zoneId:     z.string().uuid().optional(),
  cameraId:   z.string().uuid().optional(),
  sortBy:     z.enum(['openedAt', 'severity', 'status']).default('openedAt'),
});
export type IncidentListQuery = z.infer<typeof IncidentListSchema>;
```

---

## Backend — Service list method (canonical pattern)

```typescript
// The complete, production-ready list method — CameraService shown, IncidentService is the same shape
static async list(query: CameraListQuery, actor: AuthUser) {
  const { page, limit, search, status, zoneId, protocol, from, to, sortBy, sortDir } = query;

  // ── Build where clause ──────────────────────────────────────────────────
  const where: Prisma.CameraWhereInput = {
    organizationId: actor.organizationId,
    deletedAt: null,
  };

  // Restricted-role scope — a CLIENT_VIEWER only sees cameras in zones they're scoped to
  if (actor.role === UserRole.CLIENT_VIEWER) {
    where.zoneId = { in: actor.scopedZoneIds };
  }

  // Enum filters
  if (status)   where.status   = status;
  if (protocol) where.protocol = protocol;
  if (zoneId)   where.zoneId   = zoneId;

  // Date range — installed/last-checked window, or any date field the module needs
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: new Date(to)   } : {}),
    };
  }

  // Full-text search — case-insensitive substring on multiple fields
  if (search) {
    where.OR = [
      { name:      { contains: search, mode: 'insensitive' } },
      { rtspHost:  { contains: search, mode: 'insensitive' } },
      { zone:      { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  // ── Build orderBy ───────────────────────────────────────────────────────
  const orderBy: Prisma.CameraOrderByWithRelationInput =
    sortBy ? { [sortBy]: sortDir } : { createdAt: 'desc' };

  // ── Execute count + data in one transaction ─────────────────────────────
  const [data, total] = await prisma.$transaction([
    prisma.camera.findMany({
      where,
      orderBy,
      skip:    (page - 1) * limit,
      take:    limit,
      include: {
        zone: { select: { id: true, name: true } },
      },
    }),
    prisma.camera.count({ where }),
  ]);

  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
```

- [ ] `CLIENT_VIEWER` scope is enforced via `zoneId: { in: actor.scopedZoneIds }` — never a full-org list for a client account
- [ ] Same method shape covers `IncidentService.list` (swap `zoneId`/`cameraId`/`severity` filters in) —
  don't diverge the query-builder pattern between modules

---

## Backend — Routes (expose all query params)

```typescript
cameraRouter.get(
  '/',
  authenticate,
  requirePermission('cameras', 'read'),                // register 'cameras' in shared/src/permissions.ts first
  validateRequest({ query: CameraListSchema }),
  CameraController.list,
);
```

---

## Frontend — RTK Query with all filters

```typescript
// frontend/src/features/camera/cameraApi.ts
import type { CameraListQuery } from '@vms/shared';

export const cameraApi = createApi({
  reducerPath: 'cameraApi',
  baseQuery,
  tagTypes: ['Camera'],
  endpoints: (builder) => ({
    getCameras: builder.query<PaginatedResponse<Camera>, CameraListQuery>({
      query: (params) => ({
        url: '/cameras',
        params,   // RTK Query serializes the object to query string automatically
      }),
      providesTags: (result) =>
        result
          ? [...result.data.map(({ id }) => ({ type: 'Camera' as const, id })),
             { type: 'Camera', id: 'LIST' }]
          : [{ type: 'Camera', id: 'LIST' }],
    }),
  }),
});
```

---

## Frontend — Filter state with URL sync

```typescript
// frontend/src/features/camera/useCameraFilters.ts
import { useSearchParams } from 'react-router-dom';
import { useMemo } from 'react';

export function useCameraFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<CameraListQuery>(() => ({
    page:    Number(searchParams.get('page'))    || 1,
    limit:   Number(searchParams.get('limit'))   || 20,
    search:  searchParams.get('search')          || undefined,
    status:  (searchParams.get('status') as any) || undefined,
    zoneId:  searchParams.get('zoneId')          || undefined,
    sortBy:  searchParams.get('sortBy')          || 'createdAt',
    sortDir: (searchParams.get('sortDir') as any) || 'desc',
    from:    searchParams.get('from')            || undefined,
    to:      searchParams.get('to')              || undefined,
  }), [searchParams]);

  const setFilter = (key: string, value: string | undefined) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      next.set('page', '1');  // reset page on filter change
      return next;
    });
  };

  return { filters, setFilter, setSearchParams };  // setSearchParams exposed so a "Clear" button can reset all filters in one call
}
```

---

## Frontend — Search input with debounce

```typescript
import { useState, useEffect } from 'react';

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => onChange(local), 300);  // 300ms debounce
    return () => clearTimeout(timer);
  }, [local, onChange]);

  return (
    <input
      className="input-field"
      placeholder="Search by camera name or RTSP host..."
      value={local}
      onChange={e => setLocal(e.target.value)}
    />
  );
}
```

---

## Frontend — Filter bar component

```typescript
function CameraFilterBar() {
  const { filters, setFilter, setSearchParams } = useCameraFilters();
  const { data: zones } = useGetZonesQuery();

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <SearchInput value={filters.search ?? ''} onChange={v => setFilter('search', v || undefined)} />

      <select className="input-field w-auto" value={filters.zoneId ?? ''} onChange={e => setFilter('zoneId', e.target.value || undefined)}>
        <option value="">All zones</option>
        {zones?.data.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
      </select>

      <select className="input-field w-auto" value={filters.status ?? ''} onChange={e => setFilter('status', e.target.value || undefined)}>
        <option value="">All status</option>
        <option value="HEALTHY">Healthy</option>
        <option value="WARNING">Warning</option>
        <option value="CRITICAL">Critical</option>
        <option value="MAINTENANCE">Maintenance</option>
      </select>

      <input type="date" className="input-field w-auto" value={filters.from ?? ''} onChange={e => setFilter('from', e.target.value || undefined)} />
      <input type="date" className="input-field w-auto" value={filters.to   ?? ''} onChange={e => setFilter('to',   e.target.value || undefined)} />

      {/* Active filters as removable chips */}
      <FilterChips filters={filters} onRemove={key => setFilter(key, undefined)} />

      {Object.values(filters).some(Boolean) && (
        <button className="btn btn--ghost btn--sm" onClick={() => setSearchParams({})}>Clear</button>
      )}
    </div>
  );
}
```

- [ ] `FilterChips` mirrors every active filter (zone name, not raw `zoneId`; "Critical", not the raw enum)
  so an operator can read their own filter state at a glance
- [ ] The same `CameraFilterBar` shape (search + zone select + status select + date range + chips) is reused
  for the incident list, swapping the status enum and adding a severity select — don't invent a second filter-bar layout

---

## Prisma index requirements for searchable/filterable fields

```prisma
model Camera {
  // ... other fields

  @@index([organizationId])
  @@index([zoneId])                 // filtered by zone
  @@index([status])                 // filtered by health status
  @@index([createdAt])              // sorted by createdAt
  @@index([organizationId, status]) // composite — most common combined filter
}

model Incident {
  // ... other fields

  @@index([organizationId])
  @@index([zoneId])
  @@index([cameraId])
  @@index([status])
  @@index([severity])
  @@index([openedAt])
  @@index([organizationId, status])
}
```

---

## Checklist

- [ ] List query schema extends `BaseListQuerySchema` with only the allowed `sortBy` enum values
- [ ] `CLIENT_VIEWER` scope restricts to `scopedZoneIds` via `zoneId: { in: [...] }` — never a full org-wide list
- [ ] Count and data fetched in a single `prisma.$transaction([...])`
- [ ] Response includes `meta.total`, `meta.page`, `meta.limit`, `meta.totalPages`
- [ ] Search uses `mode: 'insensitive'` (case-insensitive in Postgres)
- [ ] Filter state is synced to URL (bookmarkable, shareable links) and page resets to 1 on any filter change
- [ ] Search input has a 300ms debounce
- [ ] `FilterChips` shows human-readable labels, not raw IDs/enum values
- [ ] All filtered fields (`zoneId`, `status`, `severity`, `createdAt`/`openedAt`) have a Prisma `@@index`
