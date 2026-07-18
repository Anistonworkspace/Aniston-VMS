# /optimize — Find and Fix Performance Issues

Invokes `agent-performance` to audit a specific area of the codebase for N+1 queries, missing indexes, slow endpoints, large bundle chunks, and unoptimized renders.

---

## Usage

```
/optimize <target>
```

Examples:
- `/optimize camera list endpoint`
- `/optimize live-wall dashboard page`
- `/optimize prisma queries in incident module`
- `/optimize frontend bundle`
- `/optimize health-check scheduler broadcasting`

---

## What this checks

### Backend (Prisma / NestJS API)
- **N+1 queries** — `findMany` inside a loop without `include` (e.g. fetching each camera's latest `HealthCheck` in a loop instead of one query); rewrite with nested `include` or a single joined query
- **Missing indexes** — columns used in `where`, `orderBy`, or `groupBy` that lack `@@index` in schema.prisma — check the documented hot paths first: `cameraId` on `HealthCheck`, `status` on `Incident`, `siteId`/`zoneId` on `Camera`, `organizationId` on every org-scoped model
- **Unpaginated endpoints** — list routes (`GET /cameras`, `GET /incidents`, `GET /recordings`, `GET /audit-logs`) that return all rows without `?page=&limit=`; add pagination and always return `meta.total`/`meta.totalPages`
- **Missing `select`** — fetching full models when only 2-3 fields are needed (e.g. a live-wall tile only needs `cameraCode`, `status`, `thumbnailUrl` — not the full encrypted-credential row); add `select: {}` to reduce payload
- **Prisma `count` + `findMany` on same table** — rewrite as a single `$transaction([count, findMany])` to halve round trips
- **Soft-delete filter missing** — `{ deletedAt: null }` missing from a where clause causing full-table scans
- **Missing zone-scope filter** — a scoped `PROJECT_ADMIN`/`CLIENT_VIEWER` query that forgot the `UserAccessScope` filter is both a perf and a CRITICAL security bug (see `rule-security-rbac.md`) — flag both
- **Redis cache candidates** — expensive queries run on every request that could be cached with a short TTL (e.g. dashboard aggregate counts, camera health summaries)
- **`HealthCheck`/`AuditLog` growth** — these are the highest-write-volume tables; check that dashboard queries filter by a time window (`checkedAt`/`createdAt`) instead of scanning the whole table

### Frontend (React / RTK Query)
- **Missing `keepUnusedDataFor`** — RTK Query endpoints that re-fetch on every navigation (e.g. re-fetching the camera list every time the user returns to the live wall)
- **Missing `React.memo`** — list items that re-render on every parent state change (e.g. every `CameraTile`/`IncidentCard` re-rendering when one camera's status changes)
- **Missing virtualization** — lists > 100 items that render all DOM nodes at once (e.g. a large live-wall grid or the audit-log table); suggest `@tanstack/react-virtual`
- **Bundle analysis** — large imports that should be lazy-loaded (route-level code splitting already in `AppRouter.tsx`)
- **Framer Motion / canvas redraws** — animations or player-shell redraws that block the main thread; move to `transform`/`opacity` only, and check the live-wall player isn't re-mounting streams unnecessarily

### Realtime (Socket.IO / streaming)
- **Broadcasting to wrong room** — emitting a camera-status or incident update to `org:<id>` when only one user's `live-wall` needs the event (use a `user:<id>` or `zone:<id>` room instead)
- **Missing acknowledgements** — fire-and-forget emits (e.g. incident-acknowledged events) that should confirm delivery
- **MediaMTX / stream fan-out** — multiple viewers of the same camera each opening a separate upstream RTSP pull instead of sharing one relayed stream

---

## Output format

```
## Performance Audit — [Target]

### Critical (fix before next deploy)
- [PERF-001] N+1 in camera.service.ts:45 — adds 50ms per request at 125 cameras
  Fix: add include: { healthChecks: { take: 1, orderBy: { checkedAt: 'desc' } } } to the findMany call

### High
- [PERF-002] Missing index on Incident.status — full table scan on the incident kanban query
  Fix: add @@index([organizationId, status]) to schema.prisma

### Medium
- [PERF-003] LiveWallGrid re-fetches on every tab switch — set keepUnusedDataFor: 300
```

---

## Rules that apply
- `.claude/rules/rule-database.md` — index conventions
- `.claude/rules/rule-api.md` — pagination requirements
- `.claude/rules/rule-frontend.md` — RTK Query cache settings
- `.claude/rules/rule-security-rbac.md` — zone-scope filters (missing scope = correctness bug, not just perf)
