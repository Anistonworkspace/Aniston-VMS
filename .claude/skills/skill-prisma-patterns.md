# Skill — Prisma Query Patterns

These are the only correct ways to write Prisma queries against
`prisma/schema.prisma` in Aniston VMS. Every model below is described in
full in `docs/05-backend-schema.md` — read that first if a field name here
looks unfamiliar. Prisma is always accessed through an injected
`PrismaService` (see `skill-mvc-patterns.md`), never a bare module import.

---

## MANDATORY: scope filter on every query

Aniston VMS has no `organizationId` tenant column — access is scoped by
**region → site → zone**, resolved per-request by `ScopeGuard` into
`scope.allowedZoneIds` (a `PROJECT_ADMIN`/`SUPER_ADMIN` gets every zone, a
`CLIENT_VIEWER` gets the zones on their `user_access_scopes` rows). Every
single query against `camera`, `incident`, `healthCheck`, `router`,
`streamSession`, `maintenanceTask`, `savedLayout` etc. must include that
filter, or you have an IDOR: any authenticated user could read any other
client's cameras by guessing a UUID.

```typescript
// ✅ ALWAYS filter by the resolved zone scope AND deletedAt: null
async getOne(id: string, scope: AccessScope) {
  const camera = await this.prisma.camera.findFirst({
    where: { id, zoneId: { in: scope.allowedZoneIds }, deletedAt: null },
  });
  if (!camera) throw new NotFoundError('Camera', id);
  return camera;
}
```

```typescript
// ❌ WRONG — any authenticated user can read any other client's camera by ID
async getOne(id: string) {
  return this.prisma.camera.findUnique({ where: { id } });
}
```

`findUnique` **cannot** take extra `where` conditions beyond its unique
key(s) — that's exactly why scoped reads must use `findFirst`, never
`findUnique`, once a second filter (zone scope, `deletedAt`) is involved.

---

## Pagination pattern — `$transaction([findMany, count])`

```typescript
// ✅ CORRECT — one round trip, consistent snapshot, real totalPages
const [items, totalItems] = await this.prisma.$transaction([
  this.prisma.incident.findMany({
    where: { zoneId: { in: scope.allowedZoneIds }, status: query.status, deletedAt: null },
    orderBy: { firstDetectedAt: 'desc' },
    select: { id: true, incidentNumber: true, status: true, diagnosis: true, cameraId: true, firstDetectedAt: true },
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  }),
  this.prisma.incident.count({
    where: { zoneId: { in: scope.allowedZoneIds }, status: query.status, deletedAt: null },
  }),
]);
const totalPages = Math.ceil(totalItems / query.limit);
```

```typescript
// ❌ WRONG — no take/skip, no scope filter, pulls every incident ever raised
const items = await this.prisma.incident.findMany();
```

---

## Multi-row writes: `$transaction` for anything that must be atomic

Resolving an incident touches at least two tables — the `incident` row
itself and its append-only `incidentEvent` timeline — plus the audit log.
All three commit together or not at all.

```typescript
// ✅ CORRECT
await this.prisma.$transaction(async (tx) => {
  const result = await tx.incident.updateMany({
    where: { id, status: 'ACKNOWLEDGED', zoneId: { in: scope.allowedZoneIds } },
    data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedById: scope.userId },
  });
  if (result.count === 0) throw new ConflictError('Incident is not in an acknowledgeable state');

  await tx.incidentEvent.create({ data: { incidentId: id, type: 'RESOLVED', actorId: scope.userId } });
  await tx.auditLog.create({
    data: { entityType: 'Incident', entityId: id, action: 'RESOLVE', actorId: scope.userId, oldValue: { status: 'ACKNOWLEDGED' }, newValue: { status: 'RESOLVED' } },
  });
});
```

---

## Optimistic locking for status transitions — `updateMany` + row count

Every state machine transition (`skill-state-machine-patterns.md`) is
implemented as an `updateMany` whose `where` clause **re-asserts the
expected current status**. If two operators click "Acknowledge" at the same
moment, the second request's `updateMany` matches zero rows and the service
throws `ConflictError` — never a silent double-transition or a lost update.

```typescript
// ✅ CORRECT — the where.status guard IS the optimistic lock
const result = await this.prisma.incident.updateMany({
  where: { id, status: { in: ['ALERTED', 'CONFIRMED'] }, zoneId: { in: scope.allowedZoneIds } },
  data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
});
if (result.count === 0) throw new ConflictError('Incident already acknowledged, resolved, or out of scope');
```

```typescript
// ❌ WRONG — read-then-write race: two requests can both pass the check
const incident = await this.prisma.incident.findUnique({ where: { id } });
if (incident.status === 'ALERTED') {
  await this.prisma.incident.update({ where: { id }, data: { status: 'ACKNOWLEDGED' } });
}
```

---

## Eager-load relations to avoid N+1

```typescript
// ✅ CORRECT — one query, camera + its site + its router in the payload
const cameras = await this.prisma.camera.findMany({
  where: { zoneId: { in: scope.allowedZoneIds }, deletedAt: null },
  include: { site: { select: { name: true, addressLine: true } }, router: { select: { id: true, status: true } } },
});
```

```typescript
// ❌ WRONG — one query for the list, then one query PER camera in a loop
const cameras = await this.prisma.camera.findMany({ where: { zoneId: { in: scope.allowedZoneIds } } });
for (const cam of cameras) {
  cam.site = await this.prisma.site.findUnique({ where: { id: cam.siteId } }); // 1 + N round trips
}
```

---

## Schema conventions to follow when adding a model

Every operational table follows the same shape — copy this, don't
improvise a new convention:

```prisma
// prisma/schema.prisma
model Camera {
  id                String        @id @default(uuid())
  cameraCode        String        @unique // e.g. "CAM-042"
  siteId            String
  zoneId            String
  routerId          String?
  status            CameraStatus  @default(UNKNOWN)
  mainRtspUrlEnc    String        // AES-256-GCM ciphertext — see below, never selected by default in list endpoints
  subRtspUrlEnc     String?
  connectionQuality Int?          // 0-100, computed score
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
  deletedAt         DateTime?

  site         Site          @relation(fields: [siteId], references: [id])
  zone         Zone          @relation(fields: [zoneId], references: [id])
  router       Router?       @relation(fields: [routerId], references: [id])
  healthChecks HealthCheck[]
  incidents    Incident[]

  @@index([zoneId])
  @@index([siteId])
  @@index([status])
}

enum CameraStatus {
  HEALTHY
  WARNING
  CRITICAL
  MAINTENANCE
  UNKNOWN
}
```

Every model gets: a `String @id @default(uuid())`, `createdAt`/`updatedAt`,
`deletedAt` soft-delete, an index on every foreign key it's commonly
filtered by (`zoneId`, `siteId`, `cameraId`, `status`), and a `@@map` only
if the physical table name diverges from the Prisma model name.

---

## Encrypted columns: never `select` them by default

`mainRtspUrlEnc`, `subRtspUrlEnc`, `wifiPasswordEnc` and similar
AES-256-GCM-encrypted columns must not appear in list/detail API responses.
Use an explicit `select` that omits them for anything client-facing, and
only decrypt inside the worker/service that actually needs to open an RTSP
connection (`services/media` via MediaMTX, or the health-probe worker).

```typescript
// ✅ CORRECT — API responses never see the ciphertext
const camera = await this.prisma.camera.findFirst({
  where: { id, zoneId: { in: scope.allowedZoneIds } },
  select: { id: true, cameraCode: true, status: true, connectionQuality: true, siteId: true, zoneId: true },
});

// ✅ CORRECT — only the probe worker decrypts, and only in memory
const row = await this.prisma.camera.findUniqueOrThrow({ where: { id }, select: { mainRtspUrlEnc: true } });
const rtspUrl = decrypt(row.mainRtspUrlEnc); // AES-256-GCM, key from ENCRYPTION_KEY
```

```typescript
// ❌ WRONG — default findMany() with no select ships ciphertext to the browser
const cameras = await this.prisma.camera.findMany({ where: { zoneId: { in: scope.allowedZoneIds } } });
```

---

## JSON columns — validate at the boundary, don't trust the blob

`alertRule.condition` and `auditLog.oldValue`/`newValue` are `Json`. Cast
and validate with a class/zod schema at the point you read them; never
destructure an untyped `Json` value straight into business logic.

```typescript
// ✅ CORRECT
const rule = await this.prisma.alertRule.findUniqueOrThrow({ where: { id } });
const condition = AlertConditionSchema.parse(rule.condition); // throws ValidationError on drift

// ❌ WRONG — assumes shape, breaks silently if a seed script wrote a different shape
const failCount = (rule.condition as any).consecutiveFailures;
```