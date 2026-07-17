---
# MVC Architecture — Mandatory for Every Feature

This project enforces a strict 4-layer architecture. Every backend feature MUST
follow this exact structure. No exceptions.

**Code templates live in [`skill-mvc-patterns.md`](../skills/skill-mvc-patterns.md).**
This file is policy only — what each layer MUST and MUST NOT contain.

---

## The 4 layers

### Layer 1 — Model (Prisma schema)
**Location:** `prisma/schema.prisma`
- Single source of truth for ALL data shapes
- TypeScript types generated automatically — never write manual DB types
- Enums mirrored in `shared/src/enums.ts` — always keep in sync
- Sensitive fields suffixed `Encrypted`

### Layer 2 — View (React components)
**Location:** `frontend/src/features/<name>/`
- Renders data — zero business logic allowed
- All data comes from RTK Query hooks — never raw fetch()
- Validation schemas come from `shared/src/schemas/` via `zodResolver()`
- Conditional renders based on data are fine; calculations are not

### Layer 3 — Controller (Express controllers)
**Location:** `backend/src/modules/<name>/<name>.controller.ts`
- Thin layer: parse request → call ONE service method → return response
- NEVER contains Prisma queries, business conditions, auditLogger calls, or socket emits
- ALWAYS wraps in try/catch and passes errors to `next(err)`
- Returns the standard API envelope: `{ success: true, data: ... }`

### Layer 4 — Service (Business logic)
**Location:** `backend/src/modules/<name>/<name>.service.ts`
- ALL business rules, validations, conditions live here
- ALL Prisma queries — every one includes `organizationId: actor.organizationId`
- ALL `prisma.$transaction()` blocks for multi-table writes
- ALL `auditLogger.log()` calls on create/update/delete
- ALL BullMQ queue pushes
- ALL Socket.io emits
- Throws `AppError` subclasses — never raw `Error` or HTTP status codes

---

## Required file structure per backend module

```
backend/src/modules/<name>/
  <name>.controller.ts    ← THIN: parse → call service → respond
  <name>.service.ts       ← THICK: all logic, all DB, all side effects
  <name>.routes.ts        ← middleware chain + route registration
  <name>.validation.ts    ← Zod request schemas
  __tests__/
    <name>.service.test.ts  ← unit tests target service, not controller
```

---

## Middleware chain order (NEVER change this)

```
authenticate → requirePermission(resource, action) → validateRequest → controller
```

`requirePermission` always takes **2 args**: the resource key (lowercase plural,
e.g. `'items'`) and the action (`'read' | 'create' | 'update' | 'delete'`).
The resource key MUST exist in `shared/src/permissions.ts` before its route is wired.

---

## What NEVER belongs in a controller
- Prisma queries of any kind
- Business condition checks (if duplicate exists, if status allows)
- `auditLogger` calls
- BullMQ queue pushes
- Socket.io emits
- Nested try/catch blocks

## What NEVER belongs in a service
- `req`, `res`, `next` — ever
- `res.json()` or `res.status()`
- HTTP status codes set directly (throw `AppError`, not HTTP)

---

## Checklist (binary — apply on every PR review)

- [ ] Controller methods are ≤ 10 lines each — parse → service call → respond → catch
- [ ] Service contains all `prisma.*` calls — controller has zero
- [ ] Every Prisma query on org-scoped models has both `organizationId` AND `deletedAt: null`
- [ ] Every write touching > 1 table is inside `prisma.$transaction(...)`
- [ ] Every create/update/delete in service has a matching `auditLogger.log()` call inside the transaction
- [ ] Routes file middleware chain order matches the canonical 4 above, never reordered
- [ ] `requirePermission` is 2-arg form on every route — `('items', 'create')` not `('ITEM_CREATE')`
- [ ] Service throws `AppError` subclasses (`NotFoundError`, `ConflictError`, `ForbiddenError`) — never raw `Error` or HTTP codes
- [ ] List endpoints return `meta.total` AND `meta.totalPages` in addition to `meta.page` and `meta.limit`
- [ ] `__tests__/<name>.service.test.ts` exists and exercises happy path + main error path per public method

For working code templates see [`skill-mvc-patterns.md`](../skills/skill-mvc-patterns.md).
