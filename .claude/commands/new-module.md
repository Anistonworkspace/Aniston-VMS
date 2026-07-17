---
name: new-module
description: Scaffold a complete new feature module with backend (routes/controller/service/validation) and frontend (RTK Query API + page component). Usage: /new-module <name>
---

When invoked as /new-module <name> (e.g. /new-module invoice):

**Step 0 — Setup gate (MANDATORY, run FIRST)**
Run `bash .claude/hooks/doctor.sh --quiet`. If it exits non-zero, STOP — do not scaffold.
Run `/doctor --fix`, give the user any remaining ⛔ steps + the issue, and only proceed
once the doctor exits 0. (Hard gate — see rule-completion-standards.md.)

**Step 1 — Write a plan first**
Create memory/plans/_active/YYYY-MM-DD-module-<name>.md before touching any code.

**Step 2 — Backend: create backend/src/modules/<name>/**
- `<name>.routes.ts` — Express router. Middleware order: authenticate → requirePermission → validateRequest → controller
- `<name>.controller.ts` — Thin controller. parse request → call service → send response. Always try/catch + next(err).
- `<name>.service.ts` — All business logic. organizationId in every Prisma query. prisma.$transaction for multi-table writes. auditLogger.log() on every create/update/delete.
- `<name>.validation.ts` — Zod schemas: Create<Name>Schema and Update<Name>Schema

**Step 3 — Register in app.ts**
Add: `app.use('/api/<name>s', <name>Router)` in backend/src/app.ts

**Step 4 — Frontend: create frontend/src/features/<name>/**
- `<name>Api.ts` — RTK Query endpoints. Every query has providesTags. Every mutation has invalidatesTags.
- `<Name>Page.tsx` — List + form page. Shows loading skeleton, empty state, error toast. Uses Button/Card/Input from @/components/ui.

**Step 5 — Wire the router**
Add lazy-loaded route to frontend/src/router/AppRouter.tsx

**Step 6 — Add to sidebar navigation**
Add nav item to frontend/src/components/layout/Sidebar.tsx

**Step 7 — Prisma model**
Add to prisma/schema.prisma. Required fields: id (uuid), organizationId, createdAt, updatedAt, deletedAt (nullable). Add @@index on organizationId.

**Step 8 — Permissions**
Add resource to shared/src/permissions.ts with all 4 actions: create, read, update, delete

**Step 9 — Sync and generate**
Run: npm run db:generate (and npm run db:push for dev, or npm run db:migrate for a named migration)

**Step 10 — Update memory**
Run /done to save progress to memory/
