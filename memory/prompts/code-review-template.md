# Prompt Template — Code Review Request

Copy this prompt when asking Claude to review code before committing or merging.  
Replace everything in `<angle brackets>`.

---

## Prompt to paste

```
/start

Please review the code I just wrote for the <module-name / feature-name>.

**What I changed:**
<Brief description: added X endpoint, updated Y component, migrated Z schema>

**Files changed:**
- <backend/src/modules/...>
- <frontend/src/features/...>
- <prisma/schema.prisma (if applicable)>

**What I'm unsure about:**
<Any specific concern: is my RBAC correct? is my Prisma query efficient? is the state machine complete?>

Please use agent-code-review to check:
1. All rule-*.md rules (especially rule-security-rbac.md and rule-backend.md)
2. organizationId scoping on every Prisma query
3. Middleware order: authenticate → requirePermission → validateRequest → controller
4. RTK Query providesTags / invalidatesTags wiring
5. State machine completeness (if status field is involved)
6. Missing edge cases (404, 403, wrong state, soft-deleted records)
7. auditLogger called on every create/update/delete
8. No raw fetch() on frontend

Report findings as [CATEGORY-NNN] with severity and exact fix.
```

---

## Review checklist the AI checks

- [ ] `rule-api.md` — envelope format, HTTP codes, rate limits, pagination
- [ ] `rule-backend.md` — controller thin, service has business logic, AppError subclasses
- [ ] `rule-security-rbac.md` — organizationId from req.user, self-approval check, IDOR
- [ ] `rule-database.md` — UUID IDs, soft delete, indexes, encrypted field names
- [ ] `rule-frontend.md` — RTK Query only, Redux for auth only, Zod resolver on forms
- [ ] `rule-state-machines.md` — all transitions defined, terminal states respected
- [ ] `rule-testing-standards.md` — coverage targets met
