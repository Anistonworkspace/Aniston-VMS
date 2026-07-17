# Prompt Template — New Module

Copy this prompt into Claude Code when scaffolding a new feature.  
Replace everything in `<angle brackets>`.

---

## Prompt to paste

```
/start

I need to build the <module-name> module. Here is the full spec:

**What it does:**
<1–2 sentence description of the feature>

**Entities / DB models needed:**
- <ModelName>: <field list with types>
- <Relations to existing models>

**Endpoints needed:**
- GET /api/<resource> — list (paginated, org-scoped)
- POST /api/<resource> — create
- GET /api/<resource>/:id — get one
- PATCH /api/<resource>/:id — update
- DELETE /api/<resource>/:id — soft delete
- <any extra actions, e.g. POST /api/<resource>/:id/approve>

**Who can do what (RBAC):**
- SUPER_ADMIN: full CRUD
- ADMIN: full CRUD within their org
- MANAGER: <what managers can do>
- EMPLOYEE: <what employees can do — usually read-only own records>

**Status / state machine (if applicable):**
- States: <PENDING, APPROVED, REJECTED, CANCELLED>
- Valid transitions: PENDING → APPROVED (by MANAGER/ADMIN), PENDING → REJECTED (by MANAGER/ADMIN), APPROVED → CANCELLED (by ADMIN)
- Terminal states: <CANCELLED, REJECTED>

**Frontend page:**
- List view at /dashboard/<resource>
- <Detail modal or separate page>
- <Any filters: by status, by department, by date range>

**Notifications:**
- After <action>, notify <who> via socket + email queue

Please use /new-module <module-name> and follow the full scaffold process.
```

---

## What the AI will build

Following the `/new-module` command:

1. `memory/plans/_active/YYYY-MM-DD-<module-name>.md` — plan with rollback
2. `backend/src/modules/<name>/` — controller, service, routes, validation
3. Register routes in `backend/src/app.ts`
4. `frontend/src/features/<name>/` — RTK Query API + page component
5. `frontend/src/router.tsx` — lazy route added
6. Sidebar link added
7. `prisma/schema.prisma` — new model with all required fields
8. `shared/src/permissions.ts` — new permissions added
9. `npm run db:generate` reminder
10. `/done` — memory updated
