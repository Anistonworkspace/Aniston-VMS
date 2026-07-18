---
name: new-module
description: Scaffold a complete new NestJS module — module/controller/service/DTOs/Prisma model on the backend, and an RTK Query slice + page on the frontend. Usage: /new-module <name>
---

When invoked as /new-module <name> (e.g. `/new-module vendor` for a CCTV hardware vendor directory):

**Step 0 — Setup gate (MANDATORY, run FIRST)**
Run `bash .claude/hooks/doctor.sh --quiet`. If it exits non-zero, STOP — do not scaffold.
Run `/doctor --fix`, give the user any remaining ⛔ steps + the issue, and only proceed
once the doctor exits 0. (Hard gate — see rule-completion-standards.md.)

**Step 1 — Write a plan first**
Create memory/plans/_active/YYYY-MM-DD-module-<name>.md before touching any code.

**Step 2 — Backend: create apps/api/src/modules/<name>/**
This is a **NestJS module**, not an Express MVC folder:
- `<name>.module.ts` — `@Module({ controllers: [...], providers: [...], imports: [PrismaModule] })`, registered in `apps/api/src/app.module.ts`
- `<name>.controller.ts` — `@Controller('<name>s')`. Guard/pipe order is mandatory: `@UseGuards(JwtAuthGuard, RolesGuard, ZoneScopeGuard)` → `ValidationPipe` (global, DTO-driven) → handler. Handlers return plain DTOs/entities — the global `TransformInterceptor` (`apps/api/src/common/interceptors/transform.interceptor.ts`) wraps the `{ success, data, meta }` envelope; never build it by hand.
- `<name>.service.ts` — all business logic. Every Prisma query includes `organizationId` (from `req.user.organizationId`, never from the body) AND, for `PROJECT_ADMIN`/`CLIENT_VIEWER`, the resolved zone-scope filter from `UserAccessScope` (see `rule-security-rbac.md`). Use `prisma.$transaction` for multi-table writes. Call `auditLogger.log()` on every create/update/delete. Thrown errors are `AppError` subclasses (e.g. `NotFoundError`, `ForbiddenError`) that map to a stable `error.code` (e.g. `CAMERA_NOT_FOUND`) via the global `AllExceptionsFilter` — never let a raw Prisma/Node error escape.
- `dto/create-<name>.dto.ts` and `dto/update-<name>.dto.ts` — `class-validator`-decorated DTOs (rejected payloads → 400 automatically via the global `ValidationPipe`)

**Step 3 — Danger-check zone scope before wiring routes**
If `<name>` hangs off the `Organization → Site → Zone → Camera` hierarchy (or any `UserAccessScope`-scoped resource), confirm the controller/service resolves the scope chain and intersects it with the caller's `UserAccessScope` rows — this is what `ZoneScopeGuard` enforces; never re-implement the check ad hoc in the service.

**Step 4 — Frontend: create apps/web/src/features/<name>/**
- `<name>Api.ts` — RTK Query endpoints injected into the root API slice. Every query has `providesTags` (e.g. `'<Name>'`); every mutation has `invalidatesTags`. Never call `fetch()`/`axios` directly.
- `<Name>Page.tsx` — list + form page. Skeleton/`Loader2` during loading, an explicit empty state (an empty list is not an error), toast on mutation success/error. Tailwind only, using the existing soft-SaaS tokens: cream canvas (`var(--canvas-color)`), white rounded `.card`/`.floating-card` surfaces, indigo/coral/sand accents only — see `.claude/skills/skill-ui-ux-checklist.md`. Forms use React Hook Form + a Zod resolver.

**Step 5 — Wire the router**
Add a lazy-loaded route to `apps/web/src/router/AppRouter.tsx`.

**Step 6 — Add to sidebar navigation**
Add a nav item to the sidebar (`SidebarZoneItem`-style entry). Gate it on `user.role` (`SUPER_ADMIN`/`PROJECT_ADMIN`/`CLIENT_VIEWER`) using `hasPermission()` from `@aniston-vms/shared/permissions` — never render an admin-only action for a role that can't call it.

**Step 7 — Prisma model**
Add to `prisma/schema.prisma`. Required fields: `id String @id @default(uuid())`, `organizationId String`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`, `deletedAt DateTime?` (soft delete). Add `@@index([organizationId, ...])`, plus any hot-path filters (e.g. `siteId`/`zoneId` if the entity hangs off the site/zone hierarchy). New enums go in BOTH `schema.prisma` AND `shared/src/enums.ts` (target `packages/shared/src/enums.ts`).

**Step 8 — Permissions**
Add the resource to `shared/src/permissions.ts` (target `packages/shared/src/permissions.ts`) with all 4 actions: create, read, update, delete — scoped per role (`SUPER_ADMIN` full, `PROJECT_ADMIN` org-scoped, `CLIENT_VIEWER` read-only within their `UserAccessScope`).

**Step 9 — Sync and generate**
Run: `pnpm db:generate` (and `pnpm db:push` for a quick dev iteration, or `/migrate` for a named migration — never `prisma db push` in production).

**Step 10 — Update memory**
Run /done to save progress to memory/
