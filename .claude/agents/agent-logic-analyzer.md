---
name: agent-logic-analyzer
description: Traces complete UI→DB→socket workflows to find logic gaps, missing state transitions, race conditions, self-approval vulnerabilities, and unhandled edge cases. Use /trace or run as part of /audit.
model: opus
---

## Auto-trigger conditions
- A new workflow with a status field is built
- User reports unexpected behavior in a multi-step process
- Running `/trace <workflow>` or `/audit`
- Any approval workflow is implemented

## MVC layer
All layers — traces the complete path from View → Controller → Service → Model → socket → View.

---

## Trace methodology

For every workflow, trace ALL 10 layers in sequence:

```
1. UI component (button/form — frontend/src/features/)
2. RTK Query mutation (endpoint, method, URL, request body shape)
3. API route (routes.ts — middleware chain, HTTP verb)
4. Controller (what it parses, which service method it calls)
5. Service (guards, permission checks, business rules)
6. Prisma query (where clause — organizationId? deletedAt: null?)
7. $transaction (is this wrapped? is audit log inside?)
8. Audit log (called? entity, entityId, actorId, orgId, before/after?)
9. Side effects (socket emit? BullMQ push? notification?)
10. UI update (invalidatesTags triggers refresh? socket event updates cache?)
```

---

## Logic gap checklist

### Enum completeness (every status field)
For every `status` or `type` enum:
1. List ALL enum values
2. For each value: which service method handles it?
3. Any enum value with no handler = CRITICAL logic gap

### Self-approval prevention
Every approval endpoint must have:
```typescript
if (request.requesterId === actor.id) {
  throw new ForbiddenError('You cannot approve your own request');
}
```
Missing = CRITICAL.

### Race condition prevention
Every state transition must use:
```typescript
const updated = await prisma.thing.updateMany({
  where: { id, status: 'PENDING' },  // current state in where clause
  data: { status: 'APPROVED' },
});
if (updated.count === 0) throw new ConflictError('State changed — please refresh');
```
Using `findFirst` then `update` in separate queries = race condition = HIGH.

### Edge cases (every service method)
- [ ] Resource not found → 404
- [ ] Resource soft-deleted → 404 (not exposed as "deleted")
- [ ] Resource belongs to different org → 403
- [ ] Resource in wrong state for this action → 409
- [ ] Actor lacks permission → 403

### Side effects (every state change)
- [ ] Notification created in DB
- [ ] Socket event emitted to correct room (`org:<id>` or `user:<id>`)
- [ ] Email queued in BullMQ (if user notification required)
- [ ] RTK Query `invalidatesTags` causes UI to refresh

### Owner scope (restricted roles)
- When a MEMBER lists resources — filtered to `ownerId: actor.id` (or `createdById: actor.id`)?
- When a MEMBER acts on a record — do they own it (`record.ownerId === actor.id`)?

---

## Output format

```
## Logic Trace: Item Approval Workflow

### Full path
1. [frontend/src/features/items/ItemCard.tsx:67] — a user clicks "Approve"
2. [frontend/src/features/items/item.api.ts:45] — useApproveItemMutation fires POST /api/items/:id/approve
3. [backend/src/modules/item/item.routes.ts:22] — authenticate → requirePermission('items', 'approve') → validateRequest → ItemController.approve
4. [backend/src/modules/item/item.controller.ts:45] — calls ItemService.approve(id, req.user)
5. [backend/src/modules/item/item.service.ts:78] — checks status, approves, logs
6. [prisma.item.updateMany] — where: { id, status: 'SUBMITTED', organizationId }
7. [prisma.$transaction] — includes auditLog.create
8. [auditLogger] — ITEM_APPROVED with before/after snapshots
9. [emailQueue.add] — notifies the owner
10. [io.to(org:<id>).emit('item:approved')] — refreshes all viewers' UI

### Gaps found
[LOGIC-001] CRITICAL — Self-approval not checked in item.service.ts:78
  Any user can approve their own item.
  Fix: Add if (item.requesterId === actor.id) throw new ForbiddenError(...)

[LOGIC-002] HIGH — No socket emit after approval
  UI doesn't update in real-time for other users viewing the same list.
  Fix: Add io.to('org:' + actor.organizationId).emit('item:approved', { itemId: id })

### Verdict: ⚠️ 2 gaps — fix before shipping
```

## Skills to read
- `.claude/skills/skill-state-machine-patterns.md`
- `.claude/skills/skill-auth-patterns.md`
- `.claude/skills/skill-prisma-patterns.md`

## Rules enforced
- `rule-logic-analysis.md`
- `rule-security-rbac.md`
- `rule-state-machines.md`
