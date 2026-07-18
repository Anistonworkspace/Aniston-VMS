# Skill — NestJS Module Patterns

Read this when writing or reviewing any `apps/api` module. Aniston VMS's backend
is **NestJS**, not Express: there is no bare `router.get(...)`. Every HTTP
surface is a `Controller → Service → PrismaService` chain, wired by Nest's DI
container. These are the exact patterns every module/controller/provider must
follow. See `docs/02-TRD.md` §8 (auth & scope) and `docs/05-backend-schema.md`
for the entities referenced below.

---

## Controller pattern (always thin)

A controller's only job is: bind the HTTP request to a typed DTO, apply
guards/pipes, call **one** service method, return what the service gives it.
No Prisma import, no business logic, no manual `try/catch` for domain errors
(a global filter handles that — see below).

```typescript
// ✅ CORRECT — apps/api/src/modules/incidents/incidents.controller.ts
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ScopeGuard } from '../auth/guards/scope.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequestScope } from '../auth/decorators/request-scope.decorator';
import { Role } from '@aniston-vms/shared';
import { IncidentsService } from './incidents.service';
import { ListIncidentQueryDto } from './dto/list-incident-query.dto';
import { AcknowledgeIncidentDto } from './dto/acknowledge-incident.dto';

@UseGuards(JwtAuthGuard, ScopeGuard)
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  list(@Query() query: ListIncidentQueryDto, @RequestScope() scope: AccessScope) {
    return this.incidents.list(query, scope);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @RequestScope() scope: AccessScope) {
    return this.incidents.getOne(id, scope);
  }

  @Patch(':id/acknowledge')
  @Roles(Role.OPERATOR, Role.ENGINEER, Role.PROJECT_ADMIN, Role.SUPER_ADMIN)
  acknowledge(
    @Param('id') id: string,
    @Body() dto: AcknowledgeIncidentDto,
    @RequestScope() scope: AccessScope,
  ) {
    return this.incidents.acknowledge(id, dto, scope);
  }
}
```

```typescript
// ❌ WRONG — Express habits leaking into a Nest controller
@Controller('incidents')
export class IncidentsController {
  @Patch(':id/acknowledge')
  async acknowledge(@Param('id') id: string, @Body() body: any, @Req() req) {
    // ❌ no DTO — `any` body, no validation
    // ❌ importing prisma directly in a controller
    const incident = await prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new Error('not found'); // ❌ generic Error, no HTTP mapping
    if (incident.zoneId !== req.user.zoneId) { /* ❌ hand-rolled scope check */ }
    incident.status = 'ACKNOWLEDGED'; // ❌ mutating a plain object, no transaction
    await prisma.incident.update({ where: { id }, data: incident });
    return incident;
  }
}
```

---

## DTOs with class-validator (never a bare object)

Every request body/query is a class decorated with `class-validator` +
`class-transformer`, validated by the global `ValidationPipe`
(`whitelist: true, forbidNonWhitelisted: true, transform: true` in
`main.ts`). This replaces the old `zod` `CreateItemSchema` pattern — same
intent, different library.

```typescript
// apps/api/src/modules/incidents/dto/acknowledge-incident.dto.ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AcknowledgeIncidentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

// apps/api/src/modules/incidents/dto/list-incident-query.dto.ts
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { IncidentStatus } from '@aniston-vms/shared';

export class ListIncidentQueryDto {
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsUUID() zoneId?: string;
  @IsOptional() @IsEnum(IncidentStatus) status?: IncidentStatus;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
```

`forbidNonWhitelisted: true` means any property not declared on the DTO is
**rejected**, not silently dropped — this is what stops a client from
smuggling `status: 'CLOSED'` into a create payload.

---

## Guards: authentication, scope, roles, permissions

Four guards run, in order, in front of anything sensitive. None of this is
`req.user.orgId === body.orgId` hand-rolled in a controller.

1. **`JwtAuthGuard`** — verifies the access token, attaches `req.user`
   (`{ userId, role }`).
2. **`ScopeGuard`** — loads the caller's `user_access_scopes` rows and
   attaches a resolved `AccessScope` (`{ scopeType, allowedRegionIds,
   allowedSiteIds, allowedZoneIds }`) to the request via the
   `@RequestScope()` param decorator. **Every** query in the service layer
   must be filtered through this — see `skill-prisma-patterns.md`.
3. **`RolesGuard`** + **`@Roles(...)`** — coarse role check
   (`SUPER_ADMIN | PROJECT_ADMIN | OPERATOR | ENGINEER | CLIENT_VIEWER |
   AUDITOR`).
4. **`PermissionsGuard`** + **`@RequirePermission('incident:doctor-mark')`** —
   fine-grained action check for the handful of actions that don't map
   cleanly to a role (e.g. only an `ENGINEER` who has been assigned the
   incident, or a `PROJECT_ADMIN`, may perform the physical-fix
   `doctor-mark` on `CAM-042`, and only `PROJECT_ADMIN`/`SUPER_ADMIN` may
   `CLOSED` an incident).

```typescript
// ✅ CORRECT — declarative, testable in isolation
@Patch(':id/doctor-mark')
@RequirePermission('incident:doctor-mark')
doctorMark(@Param('id') id: string, @RequestScope() scope: AccessScope) {
  return this.incidents.doctorMark(id, scope);
}
```

```typescript
// ❌ WRONG — permission logic buried inside the handler body
@Patch(':id/doctor-mark')
doctorMark(@Param('id') id: string, @Req() req) {
  if (req.user.role !== 'ENGINEER' && req.user.role !== 'PROJECT_ADMIN') {
    throw new ForbiddenException(); // works, but not reusable/auditable across routes
  }
  ...
}
```

---

## Error handling: domain exceptions + one global filter

Services throw typed domain errors. Controllers never `try/catch` them. A
single `AllExceptionsFilter` maps every thrown error to the response shape
`{ statusCode, error, message }` and makes sure a raw Prisma error (which can
leak column names) **never** reaches the client.

```typescript
// apps/api/src/common/errors/domain-errors.ts
export class NotFoundError extends Error { constructor(entity: string, id: string) { super(`${entity} ${id} not found`); } }
export class ForbiddenError extends Error {}
export class ConflictError extends Error {} // e.g. optimistic-lock miss on a status transition
export class ValidationError extends Error { constructor(public readonly issues: unknown) { super('Validation failed'); } }
```

```typescript
// apps/api/src/common/filters/all-exceptions.filter.ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof NotFoundError) return res.status(404).json({ statusCode: 404, error: 'NOT_FOUND', message: exception.message });
    if (exception instanceof ForbiddenError) return res.status(403).json({ statusCode: 403, error: 'FORBIDDEN', message: exception.message });
    if (exception instanceof ConflictError) return res.status(409).json({ statusCode: 409, error: 'CONFLICT', message: exception.message });
    if (exception instanceof ValidationError) return res.status(422).json({ statusCode: 422, error: 'VALIDATION_ERROR', message: exception.message, issues: exception.issues });
    // NEVER pass a raw Prisma error message through — log it, return a generic 500.
    this.logger.error(exception);
    return res.status(500).json({ statusCode: 500, error: 'INTERNAL', message: 'Something went wrong' });
  }
}
```

---

## Service layer: business logic, transactions, side effects after commit

The service is where the rule "acknowledging an incident stops future
escalation steps" lives — never in the controller, never in the Prisma
call site.

```typescript
// apps/api/src/modules/incidents/incidents.service.ts
@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
    @InjectQueue('escalation') private readonly escalationQueue: Queue,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  async acknowledge(id: string, dto: AcknowledgeIncidentDto, scope: AccessScope) {
    const updated = await this.prisma.$transaction(async (tx) => {
      // Optimistic lock: only rows still in an escalatable status qualify.
      const result = await tx.incident.updateMany({
        where: { id, status: { in: ['ALERTED', 'CONFIRMED'] }, zoneId: { in: scope.allowedZoneIds } },
        data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date(), acknowledgedById: scope.userId },
      });
      if (result.count === 0) throw new ConflictError('Incident already acknowledged, resolved, or out of scope');

      await tx.incidentEvent.create({
        data: { incidentId: id, type: 'ACKNOWLEDGED', actorId: scope.userId, note: dto.note },
      });
      await this.audit.record(tx, { entityType: 'Incident', entityId: id, action: 'ACKNOWLEDGE', actorId: scope.userId });
      return tx.incident.findUniqueOrThrow({ where: { id } });
    });

    // Side effects go OUTSIDE the transaction — a Redis-backed queue add
    // must never be rolled back by a DB failure, and a DB commit must
    // never be blocked waiting on Redis.
    await this.escalationQueue.removeRepeatableByKey(`incident:${id}:escalate`).catch(() => undefined);
    await this.notificationsQueue.add('incident.acknowledged', { incidentId: id });

    return updated;
  }
}
```

---

## Soft delete — never a hard `DELETE` on operational data

`cameras`, `incidents`, `users`, `routers` etc. are soft-deleted
(`deletedAt: DateTime?`) for audit/compliance reasons — a camera that's been
decommissioned must still resolve in a 6-month-old `incident_events`
timeline. Every read filters `deletedAt: null`; the "delete" endpoint only
ever sets the timestamp.

```typescript
// ✅ CORRECT
await this.prisma.camera.update({ where: { id }, data: { deletedAt: new Date() } });

// ❌ WRONG — destroys audit trail, breaks historical incident/report joins
await this.prisma.camera.delete({ where: { id } });
```

---

## List endpoints: pagination is mandatory, scope is mandatory

```typescript
// ✅ CORRECT
async list(query: ListIncidentQueryDto, scope: AccessScope) {
  const where: Prisma.IncidentWhereInput = {
    deletedAt: null,
    zoneId: { in: scope.allowedZoneIds },
    ...(query.siteId && { camera: { siteId: query.siteId } }),
    ...(query.status && { status: query.status }),
  };
  const [items, totalItems] = await this.prisma.$transaction([
    this.prisma.incident.findMany({ where, orderBy: { firstDetectedAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
    this.prisma.incident.count({ where }),
  ]);
  return { items, page: query.page, limit: query.limit, totalItems, totalPages: Math.ceil(totalItems / query.limit) };
}
```

Never return an unbounded `findMany` on `incidents`, `health_checks`, or
`audit_logs` — these tables grow forever.

---

## Module wiring (providers, not singletons)

```typescript
// apps/api/src/modules/incidents/incidents.module.ts
@Module({
  imports: [BullModule.registerQueue({ name: 'escalation' }, { name: 'notifications' })],
  controllers: [IncidentsController],
  providers: [IncidentsService, PrismaService, AuditLogger],
  exports: [IncidentsService], // only the service crosses module boundaries — see skill-ddd-bounded-contexts-patterns.md
})
export class IncidentsModule {}
```

## Anti-patterns to flag in review

| Express-era habit | Why it's wrong here | Correct NestJS pattern |
|---|---|---|
| `import { prisma } from '../../lib/prisma'` in a controller/service | Bypasses DI, untestable, no per-request scoping | `constructor(private prisma: PrismaService)` |
| Validating with hand-rolled `if (!body.x)` | No consistent error shape, easy to miss a field | class-validator DTO + global `ValidationPipe` |
| `req.user.role === 'ADMIN'` inline | Not reusable, not visible in route metadata | `@Roles()` / `@RequirePermission()` + guard |
| Filtering only by `organizationId` | Aniston VMS has no multi-tenant `organizationId` — access is scoped by **region/site/zone** | filter by `scope.allowedZoneIds` (see `ScopeGuard`) |
| Business logic in the controller | Untestable without an HTTP layer, hides rules from the domain model | move to the `*.service.ts` |
| Enqueuing a BullMQ job inside `$transaction` | Redis isn't part of the Postgres transaction — a rollback won't un-queue the job | enqueue **after** the transaction commits |
