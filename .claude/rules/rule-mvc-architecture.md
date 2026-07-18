---
# MVC Architecture — Mandatory for Every Feature (NestJS)
Canon: docs/02-TRD.md, docs/05-backend-schema.md, docs/06-implementation-plan.md.

This project enforces a strict 4-layer architecture on top of NestJS's module system. Every backend feature
in `apps/api` MUST follow this exact structure. No exceptions.

**Code templates live in [`skill-mvc-patterns.md`](../skills/skill-mvc-patterns.md).**
This file is policy only — what each layer MUST and MUST NOT contain.

---

## The 4 layers

### Layer 1 — Model (Prisma schema)
**Location:** `prisma/schema.prisma`
- Single source of truth for ALL data shapes (Organization, Site, Zone, Camera, Router, Sim, HealthCheck,
  Incident, Escalation, Notification, Snapshot, Recording, MaintenanceTask, AuditLog, UserAccessScope)
- TypeScript types generated automatically via `@prisma/client` — never write manual DB types
- Enums mirrored in `packages/shared/src/enums.ts` — always keep in sync (`ScopeType`, `CameraStatus`,
  `IncidentStatus`, `ClipStatus`, `LayoutKind`, `StreamKind`, `TaskSource`, `TaskStatus`, `TaskType`,
  `CheckType`, `NotificationStatus`)
- Sensitive fields suffixed `Encrypted` (`rtspPasswordEncrypted`, `apiKeyEncrypted`, `simPinEncrypted`)

### Layer 2 — View (React components)
**Location:** `frontend/src/features/<name>/`
- Renders data — zero business logic allowed
- All data comes from RTK Query hooks — never raw fetch()
- Validation schemas come from `packages/shared/src/schemas/` via `zodResolver()`
- Conditional renders based on data/role/zone-scope are fine; calculations are not

### Layer 3 — Controller (NestJS controllers)
**Location:** `apps/api/src/modules/<name>/<name>.controller.ts`
- Thin layer: `@Controller('<name>')` class, one HTTP-verb-decorated method per route, parses the request via
  a class-validator DTO, calls ONE service method, returns the result
- NEVER contains Prisma queries, business conditions, `auditLogger` calls, or WebSocket/BullMQ emits
- NEVER wraps calls in try/catch — unhandled errors bubble to the global `AllExceptionsFilter`
- Guards declared with `@UseGuards(JwtAuthGuard, RolesGuard, ZoneScopeGuard)` and `@Roles(...)` /
  `@RequireScope(...)` decorators — never inline permission checks in the method body
- Returns the DTO/entity directly — the global `TransformInterceptor` wraps it in the standard envelope
  (`{ success: true, data: ... }`)

### Layer 4 — Service (Business logic, NestJS provider)
**Location:** `apps/api/src/modules/<name>/<name>.service.ts`
- `@Injectable()` class, injected into the controller (and other services) via constructor DI
- ALL business rules, validations, conditions live here (e.g. camera health scoring, incident/escalation
  policy, zone-scope resolution)
- ALL Prisma queries — every one includes `organizationId: actor.organizationId`, plus the caller's
  zone-scope filter where the role requires it (see rule-security-rbac.md)
- ALL `prisma.$transaction()` blocks for multi-table writes (e.g. opening an Incident + its first Escalation
  + the AuditLog row)
- ALL `auditLogger.log()` calls on create/update/delete
- ALL BullMQ queue pushes (`apps/workers` picks these up — health-check probes, snapshot capture,
  notification delivery)
- ALL WebSocket gateway emits (live-wall status updates, incident board updates)
- Throws `AppError` subclasses — never raw `Error` or HTTP status codes

---

## Required file structure per NestJS module

```
apps/api/src/modules/<name>/
  <name>.module.ts          ← wires controller + service + imports into Nest's DI container
  <name>.controller.ts      ← THIN: guards → DTO → call service → return
  <name>.service.ts         ← THICK: all logic, all DB, all side effects
  dto/
    create-<name>.dto.ts    ← class-validator request DTO
    update-<name>.dto.ts    ← class-validator request DTO (all fields optional via PartialType)
  __tests__/
    <name>.service.spec.ts  ← unit tests target the service, not the controller
```

---

## Guard/pipe order (NEVER change this)

```
JwtAuthGuard (authenticate) → RolesGuard + ZoneScopeGuard (authorize) → ValidationPipe (DTO) → Controller
```

`@RequireScope` is the NestJS equivalent of the old `requirePermission(resource, action)` middleware — it
always takes the resource key (lowercase plural, e.g. `'cameras'`) and the action (`'read' | 'create' |
'update' | 'delete'`), combined with `@Roles(...)` for which of `SUPER_ADMIN` / `PROJECT_ADMIN` /
`CLIENT_VIEWER` may call it. The resource key MUST exist in `packages/shared/src/permissions.ts` before its
route is wired.

---

## What NEVER belongs in a controller
- Prisma queries of any kind
- Business condition checks (camera already has an open incident, escalation policy evaluation)
- `auditLogger` calls
- BullMQ queue pushes
- WebSocket gateway emits
- Nested try/catch blocks

## What NEVER belongs in a service
- `Request`/`Response` objects or any raw HTTP transport primitives — ever
- Manually building the response envelope
- HTTP status codes set directly (throw `AppError`, not HTTP)

---

## Checklist (binary — apply on every PR review)

- [ ] Controller methods are ≤ 10 lines each — guards → DTO → service call → return
- [ ] Service contains all `prisma.*` calls — controller has zero
- [ ] Every Prisma query on org-scoped models has `organizationId`, `deletedAt: null`, AND (where the role
      requires it) a zone-scope filter
- [ ] Every write touching > 1 table is inside `prisma.$transaction(...)`
- [ ] Every create/update/delete in service has a matching `auditLogger.log()` call inside the transaction
- [ ] Module's guard order matches the canonical order above, never reordered
- [ ] `@Roles`/`@RequireScope` present on every route — never a single string like `('CAMERA_CREATE')`,
      always the 2-part resource+action form
- [ ] Service throws `AppError` subclasses (`NotFoundError`, `ConflictError`, `ForbiddenError`) — never raw
      `Error` or HTTP codes
- [ ] List endpoints return `meta.total` AND `meta.totalPages` in addition to `meta.page` and `meta.limit`
- [ ] `__tests__/<name>.service.spec.ts` exists and exercises happy path + main error path per public method

For working code templates see [`skill-mvc-patterns.md`](../skills/skill-mvc-patterns.md).