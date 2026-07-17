---
name: verify-wired
description: Mechanical 12-hop trace of a module (UI → mutation → route → controller → service → prisma → audit → socket → invalidate → toast). Reports missing hops with file:line pointers. Called automatically by /build-loop; can be run standalone against any module.
---

# /verify-wired — 12-hop end-to-end trace

Runs the wire-completeness checklist from
[`skill-wire-completeness-patterns.md`](../skills/skill-wire-completeness-patterns.md)
mechanically — via grep + AST checks — against a specific module.

Purpose: catch "half-built" features that pass their own tests but fail
end-to-end (mutation succeeds but UI shows stale data, audit trail is
silent, socket event forgotten).

---

## Usage

```
/verify-wired <module-name>
```

Examples:

- `/verify-wired notes` — checks backend/src/modules/notes/ + frontend/src/features/notes/
- `/verify-wired auth` — auth module
- `/verify-wired` — checks EVERY module (slow — for CI use)

---

## The 12 hops checked

1. UI button uses `.btn` primitive and reflects `isLoading`
2. onClick handler calls `.unwrap()` with try/catch
3. RTK Query mutation defined in `<name>Api.ts`
4. HTTP request URL matches Express route path
5. Middleware chain: `authenticate → requirePermission(res, act) → validateRequest → controller`
6. Controller is thin (≤ 10 lines, no Prisma, no business logic)
7. Service uses `organizationId` + `deletedAt: null` on every query
8. Writes touching > 1 table wrapped in `prisma.$transaction`
9. `auditLogger.log` called INSIDE the transaction
10. Socket emit AFTER transaction (for state changes only)
11. `invalidatesTags` matches `providesTags` on the list query
12. `toast.success` + `toast.error` + modal close + form reset

---

## Report format

```
## Wire-Completeness Report: notes

### Backend (backend/src/modules/notes/)
- ✅ Hop 5: middleware chain — authenticate + requirePermission('notes', 'create') + validateRequest all present
- ✅ Hop 7: organizationId + deletedAt on every query (12 findFirst, 4 findMany, 2 count)
- ✅ Hop 8: $transaction wraps writes (3 writes, all wrapped)
- ✅ Hop 9: auditLogger.log inside transaction (NOTE_CREATED, NOTE_UPDATED, NOTE_DELETED)
- ⚠️ Hop 10: socket emit MISSING on notes.approve (state change)
  Expected:  io.to(`org:${orgId}`).emit('note:approved', {...})
  Location:  backend/src/modules/notes/notes.service.ts:88

### Frontend (frontend/src/features/notes/)
- ✅ Hop 3: 4 mutations defined (create, update, delete, approve)
- ✅ Hop 11: invalidatesTags present on all 4 mutations
- ❌ Hop 12: toast.error MISSING on updateNote path
  Location: frontend/src/features/notes/NoteEditForm.tsx:64
  Fix:      Wrap mutation in try/catch, add toast.error('Failed to save note') on catch

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

- Read-only modules (Hops 8, 9, 10 don't apply — reports "N/A")
- Modules < 50 LOC — signal-to-noise too low

---

## Rules enforced

- `.claude/rules/rule-completion-standards.md` — every hop counted
- `.claude/rules/rule-mvc-architecture.md` — layer boundaries
- `.claude/rules/rule-security-rbac.md` — Hop 5 + Hop 7
- `.claude/rules/rule-state-machines.md` — Hop 8 optimistic lock (if status field)
