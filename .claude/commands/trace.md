# /trace — Full End-to-End Workflow Trace

Invokes `agent-logic-analyzer` to trace a complete user action from the UI all the way through to the database and back, exposing any gaps, missing validations, or unhandled states.

---

## Usage

```
/trace <workflow>
```

Examples:
- `/trace item create`
- `/trace item approval`
- `/trace login and token refresh`
- `/trace file upload`
- `/trace role change by admin`

---

## What gets traced

Every layer in sequence:

```
User action
  → React component (which button/form)
    → RTK Query mutation hook (which endpoint, what tags invalidated)
      → API route (method, path, middleware chain)
        → Controller (request parsing, validation schema)
          → Service (business logic, permission checks)
            → Prisma (exact query with all where clauses)
              → Database (table, indexes used)
                → Audit log entry written
                  → Socket.io event emitted (if any)
                    → RTK Query cache invalidated
                      → UI re-renders with new data
```

---

## What it checks at each layer

| Layer | Checks |
|-------|--------|
| UI | Is the button/form wired? Does it show loading state? Error state? |
| RTK Query | Are `invalidatesTags` correct? Will the list refresh after the mutation? |
| Route | Is middleware order correct: auth → permission → validate → controller? |
| Controller | Does it call `next(err)` on failure? Is request parsed correctly? |
| Service | Is `organizationId` from `req.user` (never from body)? Is `$transaction` used for multi-table writes? Is `auditLogger` called? |
| Prisma | Does every query include `organizationId`? Does every query include `{ deletedAt: null }`? |
| Permissions | Does the permission matrix in `shared/src/permissions.ts` include this action? |
| Self-approval | If this is an approval workflow, is `approverId !== requesterId` checked? |
| State machine | Are only valid transitions allowed? Is the terminal state irreversible? |
| Audit log | Is the action, entity, entityId, actorId, orgId all recorded? |

---

## Output format

```
## Trace: [Workflow Name]

### Full path
1. [frontend/src/features/X/XPage.tsx:42] — user clicks "Create" button
2. [frontend/src/features/X/x.api.ts:18] — useCreateXMutation fires POST /api/x
3. [backend/src/modules/x/x.routes.ts:12] — POST /api/x → authenticate → requirePermission(X_CREATE) → validateRequest(CreateXSchema) → XController.create
4. [backend/src/modules/x/x.controller.ts:28] — parses body, calls XService.create()
5. [backend/src/modules/x/x.service.ts:45] — creates record in $transaction, calls auditLogger
6. [prisma/schema.prisma:X model] — INSERT with organizationId from req.user
7. [backend/src/utils/auditLogger.ts] — logs X_CREATED event
8. [backend/src/sockets/] — emits 'x:created' to org:<orgId> room

### Gaps found
- [GAP-001] Missing invalidatesTags in x.api.ts — list will not refresh after create
- [GAP-002] Self-approval check missing in x.service.ts:45

### Verdict
✅ Complete / ⚠️ Has gaps (fix before shipping)
```

---

## Rules that apply
- `.claude/rules/rule-logic-analysis.md` — full trace methodology
- `.claude/rules/rule-security-rbac.md` — organizationId, IDOR, self-approval
- `.claude/rules/rule-state-machines.md` — transition validation
