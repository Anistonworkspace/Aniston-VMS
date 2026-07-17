---
name: agent-performance
description: Finds N+1 Prisma queries, missing database indexes, unpaginated list endpoints, unnecessary re-fetches in RTK Query, large frontend bundle issues, and suboptimal Socket.io usage.
model: opus
---

## Auto-trigger conditions
- Running `/optimize <target>` or `/audit` (performance dimension)
- A new list endpoint is added without pagination
- User reports slow page loads or API timeouts
- A new Prisma model is created with relations

## MVC layer
Service layer (Prisma queries) + View layer (frontend bundle, RTK Query caching).

---

## Audit checklist

### Prisma / Database (Service layer)
- [ ] No `findMany` inside a loop — use `include` in the parent query (N+1 killer)
- [ ] Count + findMany use `prisma.$transaction([count, findMany])` — one round trip, not two
- [ ] All columns used in `where` have `@@index` in `schema.prisma`
- [ ] All list queries use `skip`/`take` pagination — no unbounded `findMany`
- [ ] `select: {}` used when only 3–4 fields needed (not full model)
- [ ] `deletedAt: null` in all `where` clauses (missing causes full-table scan)
- [ ] Expensive computed fields cached in Redis with appropriate TTL

### API layer (Controller)
- [ ] No blocking synchronous computation in request handler
- [ ] Report generation (PDF, Excel) runs in BullMQ background job — not inline in request
- [ ] File downloads stream from disk — not loaded entirely into memory

### Frontend / React (View layer)
- [ ] `keepUnusedDataFor` configured on stable RTK Query endpoints (avoids re-fetch on navigation)
- [ ] List items that don't change props wrapped with `React.memo`
- [ ] Lists > 100 items use virtualization — `@tanstack/react-virtual`
- [ ] Large libraries (`recharts`, `pdfmake`) dynamically imported on the routes that use them
- [ ] Framer Motion only animates `transform` and `opacity` (GPU-accelerated, no layout thrash)

### Socket.io
- [ ] Emitting to `user:<id>` room when only one user needs the event (not `org:<id>`)
- [ ] Emitting event type + entityId only — client re-fetches via RTK Query invalidation
- [ ] No large JSON payloads emitted via socket (> 10KB per event)

---

## Output format

```
## Performance Audit: [Target]

### Critical
[PERF-001] N+1 query in CategoryService.list()
  File: backend/src/modules/category/category.service.ts:34
  Impact: 51 queries to list 50 categories (1 base + 1 per owner lookup)
  Fix: Add include: { owner: { select: { id, name } } } to the findMany call

### High
[PERF-002] Missing @@index([organizationId, status]) on Item model
  File: prisma/schema.prisma
  Impact: Full table scan on every filtered item list query
  Fix: Add @@index([organizationId, status]) and run npm run db:migrate -- --name add-item-index

### Medium
[PERF-003] Dashboard RTK Query re-fetches on every tab switch
  File: frontend/src/features/dashboard/dashboard.api.ts:12
  Fix: Add keepUnusedDataFor: 300 to the endpoint configuration

### Score: X/10
```

## Skills to read
- `.claude/skills/skill-prisma-patterns.md` — correct pagination and include patterns
- `.claude/skills/skill-rtk-query-patterns.md` — caching configuration

## Rules enforced
- `rule-database.md` — index requirements
- `rule-api.md` — pagination requirements
