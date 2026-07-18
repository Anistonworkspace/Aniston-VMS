---
name: verify-wired
description: Mechanical 12-hop trace of an Aniston VMS module (UI → mutation → route → controller → service → prisma → audit → BullMQ → socket → invalidate → toast). Reports missing hops with file:line pointers. Called automatically by /build-loop; can be run standalone against any module.
---

# /verify-wired — 12-hop end-to-end trace

Runs the wire-completeness checklist from
[`skill-wire-completeness-patterns.md`](../skills/skill-wire-completeness-patterns.md)
mechanically — via grep + AST checks — against a specific module.

Purpose: catch "half-built" features that pass their own tests but fail
end-to-end — a mutation succeeds but the live wall shows stale data, the
audit trail is silent, a BullMQ job is never enqueued, or a socket event is
forgotten so other connected operators never see the update.

---

## Usage

```
/verify-wired <module-name>
```

Examples:

- `/verify-wired incidents` — checks `apps/api/src/modules/incidents/` + `apps/web/src/features/incidents/`
- `/verify-wired cameras` — camera onboarding + health-status module
- `/verify-wired auth` — auth module
- `/verify-wired` — checks EVERY module (slow — for CI use)

---

## The 12 hops checked

1. UI element (button/card action) exists and reflects `isLoading`
2. onClick/handler calls `.unwrap()` with try/catch
3. RTK Query mutation defined in `<name>.api.ts` with correct `query` + tags
4. HTTP request URL matches a mounted NestJS route (module actually imports/registers the controller)
5. Guard chain: `JwtAuthGuard → RolesGuard → ZoneScopeGuard → ValidationPipe(<Dto>) → controller`
6. Controller is thin (≤ 10 lines, no Prisma, no business logic)
7. Service scopes every query by `organizationId` (+ `siteId`/`zoneId` where relevant) and `{ deletedAt: null }`
8. Writes touching > 1 table wrapped in `prisma.$transaction`
9. `auditLogger.log(...)` called INSIDE the transaction, with a transition-specific event name
   (e.g. `INCIDENT_ACKNOWLEDGED`, not a generic catch-all)
10. If the action should enqueue background work, the BullMQ job is actually added (queue name matches a
    live `@Processor`) — and if it's a state change, a Socket.io event is emitted AFTER the transaction commits
11. `invalidatesTags` matches `providesTags` on the corresponding list query, and a frontend `socket.on(...)`
    listener consumes the emitted event so other connected clients (different role, same org) update live
12. `toast.success` + `toast.error` + modal close + form reset

---

## Report format

```
## Wire-Completeness Report: incidents

### Backend (apps/api/src/modules/incidents/)
- ✅ Hop 5: guard chain — JwtAuthGuard + RolesGuard + ZoneScopeGuard + ValidationPipe(AcknowledgeIncidentDto) all present
- ✅ Hop 7: organizationId + deletedAt on every query (14 findFirst, 6 findMany, 2 count)
- ✅ Hop 8: $transaction wraps writes (4 writes, all wrapped)
- ✅ Hop 9: auditLogger.log inside transaction (INCIDENT_CREATED, INCIDENT_ACKNOWLEDGED, INCIDENT_ESCALATED, INCIDENT_RESOLVED)
- ⚠️ Hop 10: socket emit MISSING on incidents.escalate (state change)
  Expected:  io.to(`org:${organizationId}`).emit('incident:updated', { id, status: 'ESCALATED' })
  Location:  apps/api/src/modules/incidents/incidents.service.ts:112

### Frontend (apps/web/src/features/incidents/)
- ✅ Hop 3: 5 mutations defined (create, acknowledge, escalate, resolve, close)
- ✅ Hop 11: invalidatesTags present on all 5 mutations
- ❌ Hop 12: toast.error MISSING on acknowledgeIncident path
  Location: apps/web/src/features/incidents/IncidentKanban.tsx:64
  Fix:      Wrap mutation in try/catch, add toast.error('Failed to acknowledge incident') on catch

### Score: 8/10
### Verdict: BLOCK — 1 error (Hop 12), 1 warning (Hop 10). Fix error before marking done.
```

Scoring:
- 10 = all 12 hops ✅
- 9 = one warning (⚠️)
- 8 = one error OR two warnings
- < 8 = multiple errors → module is not ready

---

## Exit codes

- `0` — passed (score ≥ 9, 0 errors)
- `1` — warnings only (score 8)
- `2` — errors present (score < 8) — BLOCK completion

CI can gate on exit code `!= 0`.

---

## When to use

- After every `/new-module` or `/build-loop` (automatic in `/build-loop`)
- Before every merge to `main`
- After a large refactor moving service methods
- Nightly against every module (CI cron)

## When NOT to use

- Read-only modules (e.g. reporting/export views — Hops 8, 9, 10 don't apply — reports "N/A")
- Modules < 50 LOC — signal-to-noise too low

---

## Rules enforced

- `.claude/rules/rule-completion-standards.md` — every hop counted; this is Gate 2 of the DONE definition
- `.claude/rules/rule-mvc-architecture.md` — layer boundaries
- `.claude/rules/rule-security-rbac.md` — Hop 5 + Hop 7
- `.claude/rules/rule-state-machines.md` — Hop 8 optimistic lock (if a `CameraStatus`/`IncidentStatus` field is involved)
