# Skill — Wire-Completeness Patterns

The end-to-end trace every feature must survive before it can be marked done.
Used by `/verify-wired` and enforced by `agent-code-review`.

**The 12-hop trace, in order:**

```
UI button → onClick → RTK Query mutation → HTTP request
  → route middleware chain → controller → service → prisma transaction
    → auditLogger.log → socket emit (if state changed)
      → RTK Query invalidatesTags → UI cache refresh → toast → cleanup
```

If any hop is missing or wrong, the feature is "half-built" — controllers may
work but users see stale UI, or updates land silently without audit trail.
The point of `/verify-wired` is catching that mechanically.

---

## The 12 hops in detail

### Hop 1 — UI button

- Button primitive is `.btn` (design-system, not custom)
- `disabled` reflects `isLoading` from the mutation
- Icon (if present) is Lucide, size 14-16, strokeWidth 1.8

### Hop 2 — onClick handler

- Wraps the mutation call — NOT dispatching Redux directly
- Calls `.unwrap()` so the try/catch gets typed errors
- Success and error paths both surface a toast

### Hop 3 — RTK Query mutation

- Endpoint defined in `frontend/src/features/<name>/<name>Api.ts`
- Has `invalidatesTags` (checked at Hop 11)
- Body type matches the Zod schema in `shared/src/schemas/`

### Hop 4 — HTTP request

- URL matches the actual Express route path exactly
- Method matches (POST for create, PATCH for update, DELETE for delete)
- Auth header sent — via `prepareHeaders` in the base query

### Hop 5 — Route middleware chain

- Order MUST be: `authenticate → requirePermission → validateRequest → controller`
- `requirePermission` is 2-arg form: `('resource', 'action')`
- Resource key exists in `shared/src/permissions.ts`

### Hop 6 — Controller

- Thin — ≤ 10 lines
- Only: parse request → call service → return envelope
- Zero Prisma calls, zero business logic

### Hop 7 — Service method

- All Prisma queries include `organizationId: actor.organizationId`
- All findFirst/findMany include `deletedAt: null`
- Multi-table writes wrapped in `prisma.$transaction`
- Guards throw `AppError` subclasses (NotFoundError, ConflictError, ForbiddenError)

### Hop 8 — Prisma transaction

- Wraps every create/update/delete that touches > 1 table
- Optimistic lock on state transitions: `updateMany({ where: { id, status: 'CURRENT' } })`
- Zero cross-org data can leak — `where` always includes `organizationId`

### Hop 9 — auditLogger.log

- Called INSIDE the transaction (`await auditLogger.log(tx, {...})`)
- Action name follows convention: `NOTE_CREATED`, `NOTE_UPDATED`, `NOTE_DELETED`
- `before` + `after` snapshots on updates (per skill-audit-log-patterns)
- `organizationId` + `actorId` present

### Hop 10 — Socket emit (only for state changes)

- Emits AFTER the transaction commits, not inside
- Room: `org:${actor.organizationId}` (never a global broadcast)
- Payload: minimal — just IDs and enough for the client to invalidate
- Not required for read-only endpoints

### Hop 11 — invalidatesTags

- Tag types include the entity: `[{ type: 'Note', id }, { type: 'Note', id: 'LIST' }]`
- List query has matching `providesTags: [{ type: 'Note', id: 'LIST' }]`
- Cross-entity invalidation (e.g. deleting a note also affects a tag list)
  handled explicitly

### Hop 12 — UI cache refresh + toast + cleanup

- List re-renders without a page reload (invalidatesTags did its job)
- Success toast fires — `toast.success('Note created')`
- Error toast fires on catch — `toast.error('Failed to create note')`
- Modal closes on success (if applicable)
- Form resets on close (no stale values on re-open)

---

## Mechanical checks — grep-based verification

`/verify-wired <module>` runs these greps against `backend/src/modules/<name>/`
and `frontend/src/features/<name>/`. Any missing marker = a hop failed.

```bash
# Hop 3+11 — mutation has invalidatesTags
grep -E "invalidatesTags" frontend/src/features/<name>/*.ts
# Hop 5 — auth middleware chain
grep -E "requirePermission\('[a-z]+', '[a-z]+'\)" backend/src/modules/<name>/*.routes.ts
grep -E "authenticate" backend/src/modules/<name>/*.routes.ts
grep -E "validateRequest" backend/src/modules/<name>/*.routes.ts
# Hop 7 — org scope + soft delete
grep -E "organizationId: actor" backend/src/modules/<name>/*.service.ts
grep -E "deletedAt: null" backend/src/modules/<name>/*.service.ts
# Hop 8 — transaction on writes
grep -E "\$transaction" backend/src/modules/<name>/*.service.ts
# Hop 9 — audit log inside transaction
grep -E "auditLogger\.log" backend/src/modules/<name>/*.service.ts
# Hop 10 — socket emit (if not read-only)
grep -E "io\.to.*emit" backend/src/modules/<name>/*.service.ts
# Hop 12 — toast on success + error
grep -E "toast\.success" frontend/src/features/<name>/*.tsx
grep -E "toast\.error" frontend/src/features/<name>/*.tsx
```

Every match → the hop is wired. A missing match → the verifier reports
"HOP N MISSING" with file:line pointer.

---

## Pattern — the /verify-wired report shape

```
## Wire-Completeness Report: notes

### Backend
- ✅ Hop 5: middleware chain — authenticate + requirePermission('notes', 'create') + validateRequest present
- ✅ Hop 7: organizationId + deletedAt on every query
- ✅ Hop 8: $transaction wraps writes (3 writes, all wrapped)
- ✅ Hop 9: auditLogger.log inside transaction (NOTE_CREATED, NOTE_UPDATED, NOTE_DELETED)
- ⚠️ Hop 10: socket emit MISSING on notes.approve (state change) — expected io.to(`org:${orgId}`).emit('note:approved', {...})
  Location: backend/src/modules/notes/notes.service.ts:88

### Frontend
- ✅ Hop 3: 4 mutations defined
- ✅ Hop 11: invalidatesTags present on all 4 mutations
- ❌ Hop 12: toast.error MISSING on updateNote path
  Location: frontend/src/features/notes/NoteEditForm.tsx:64
  Fix: wrap the mutation call in try/catch, add toast.error('Failed to save note')

### Verdict
BLOCK — 1 error (Hop 12), 1 warning (Hop 10).
Fix the error before marking the module done.

### Score: 8/10
```

---

## When to run /verify-wired

- After every `/new-module` or `/build-loop` — mandatory before mark-done
- Before every merge to `main`
- After a large refactor that moves service methods around
- Nightly against every module (via CI or a scheduled job) — flags drift

## When NOT to run

- Read-only modules (no mutations to check) — Hop 8, 9, 10 don't apply
- Modules < 50 LOC of implementation — overhead not worth it

---

## Do-not

- **Do NOT ignore Hop 9 (audit log)** — even for "small" mutations. The audit
  trail is compliance evidence.
- **Do NOT skip Hop 10 (socket emit)** on state transitions — users see
  stale UI.
- **Do NOT rely on `providesTags` fetching after a mutation** without
  `invalidatesTags`. RTK Query only invalidates on explicit tag match.
- **Do NOT put emit INSIDE the transaction** — if the transaction rolls back
  after emitting, the UI shows a change that didn't happen.

---

## Checklist

- [ ] All 12 hops present for every mutation-shaped endpoint
- [ ] Read-only endpoints skip Hop 8, 9, 10 (correctly)
- [ ] Socket emit is AFTER transaction commit, not inside
- [ ] `invalidatesTags` on every mutation, matching `providesTags` on the
      relevant list query
- [ ] `toast.success` AND `toast.error` on every mutation
- [ ] Modal close + form reset on success
- [ ] `/verify-wired` report score ≥ 9/10 before merge
- [ ] Any warning (⚠️) tracked in a follow-up plan; any error (❌) blocks
      merge
