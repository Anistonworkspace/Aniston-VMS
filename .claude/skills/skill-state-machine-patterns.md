# Skill — State Machine Patterns

---

## Define all states and transitions upfront

```typescript
// In <name>.service.ts — document before writing code
/*
 * Item State Machine
 *
 * States:      DRAFT → SUBMITTED → APPROVED | REJECTED → CANCELLED (terminal)
 * Transitions:
 *   DRAFT → SUBMITTED   : member submits (MEMBER role)
 *   SUBMITTED → APPROVED: admin approves (ADMIN)
 *   SUBMITTED → REJECTED: admin rejects (ADMIN)
 *   APPROVED → CANCELLED: admin cancels (ADMIN only)
 * Terminal:    CANCELLED, REJECTED (cannot leave without explicit re-open)
 * Self-approval: BLOCKED — approverId !== requesterId enforced
 */
```

## Optimistic lock pattern (prevents race conditions — MANDATORY)

```typescript
// ✅ CORRECT — updateMany with current state in where clause
static async approve(id: string, actor: AuthUser) {
  const item = await prisma.item.findFirst({
    where: { id, organizationId: actor.organizationId, deletedAt: null },
  });
  if (!item) throw new NotFoundError('Item not found');
  if (item.requesterId === actor.id) throw new ForbiddenError('Cannot approve your own request');

  const updated = await prisma.item.updateMany({
    where: { id, status: 'SUBMITTED' },  // ← current state in where clause
    data: { status: 'APPROVED', approverId: actor.id, approvedAt: new Date() },
  });

  if (updated.count === 0) {
    throw new ConflictError('Item is no longer in SUBMITTED state');
  }

  // Side effects after successful transition
  await notificationQueue.add('item-approved', { itemId: id, requesterId: item.requesterId });
}

// ❌ WRONG — race condition between find and update
const item = await prisma.item.findFirst({ where: { id } });
if (item.status !== 'SUBMITTED') throw new Error('...');
await prisma.item.update({ where: { id }, data: { status: 'APPROVED' } }); // another request could have changed status here
```

## Terminal state guard

```typescript
// Guard at the start of every mutation service method
const TERMINAL_STATES = ['CANCELLED', 'REJECTED', 'COMPLETED'] as const;

static async update(id: string, dto: UpdateInput, actor: AuthUser) {
  const record = await this.getOne(id, actor);
  if (TERMINAL_STATES.includes(record.status as any)) {
    throw new ConflictError(`Cannot modify a ${record.status} request`);
  }
  // proceed
}
```

## Side effects after transition (MANDATORY pattern)

```typescript
// After every status change:
// 1. Audit log (inside transaction)
// 2. Socket emit (outside transaction)
// 3. Notification queue push (outside transaction)

const result = await prisma.$transaction(async (tx) => {
  const updated = await tx.item.updateMany({ ... });
  await auditLogger.log(tx, { action: 'ITEM_APPROVED', ... });
  return updated;
});

// Outside transaction — side effects
io.to(`org:${actor.organizationId}`).emit('item:approved', { itemId: id });
await notificationQueue.add('item-approved', { itemId: id });
```

## Frontend state machine (disable buttons based on status)

```typescript
// ✅ CORRECT — button availability tied to current state.
// 3-arg hasPermission(role, resource, action) — register 'items' in shared/src/permissions.ts first.
const canApprove = item.status === 'SUBMITTED' && hasPermission(user.role, 'items', 'update');
const canCancel  = item.status === 'APPROVED'  && hasPermission(user.role, 'items', 'delete');

<Button disabled={!canApprove} onClick={handleApprove}>Approve</Button>
<Button disabled={!canCancel} variant="destructive" onClick={handleCancel}>Cancel</Button>
```

---

## Transition table (document every workflow this way)

Always write this before implementing any state machine. Every row must have a handler.

```
| Current State | Event          | Guard                          | Next State | Side Effects                        |
|---------------|----------------|--------------------------------|------------|-------------------------------------|
| DRAFT         | SUBMIT         | member owns it                 | SUBMITTED  | notify admin, audit log             |
| SUBMITTED     | APPROVE        | approverId ≠ requesterId       | APPROVED   | notify member, deduct quota         |
| SUBMITTED     | REJECT         | approverId ≠ requesterId       | REJECTED   | notify member (terminal)            |
| APPROVED      | CANCEL         | actor is ADMIN                 | CANCELLED  | restore quota, notify member        |
| REJECTED      | —              | terminal state                 | —          | cannot leave without re-open        |
| CANCELLED     | —              | terminal state                 | —          | cannot leave without re-open        |
```

---

## Domain event on every transition (DDD style)

Emit a typed domain event after every state change. Other modules react via the event dispatcher.

```typescript
// backend/src/modules/item/domain/item-events.ts
export type ItemEvent =
  | { type: 'SUBMITTED';  itemId: string; memberId: string; approverId: string }
  | { type: 'APPROVED';   itemId: string; approverId: string; durationDays: number }
  | { type: 'REJECTED';   itemId: string; approverId: string; reason: string }
  | { type: 'CANCELLED';  itemId: string; cancelledBy: string };

// In the service — emit after transaction commits
const result = await prisma.$transaction(async (tx) => {
  const updated = await tx.item.updateMany({
    where: { id, status: 'SUBMITTED' },
    data: { status: 'APPROVED', approverId: actor.id },
  });
  if (updated.count === 0) throw new ConflictError('Item was already processed');
  await auditLogger.log(tx, { action: 'ITEM_APPROVED', entity: 'Item', entityId: id, actorId: actor.id, organizationId: actor.organizationId });
  return updated;
});

// Domain event after transaction — side effects are decoupled
const event: ItemEvent = { type: 'APPROVED', itemId: id, approverId: actor.id, durationDays: item.durationDays };
io.to(`org:${actor.organizationId}`).emit('domain:ItemApproved', event);
await notificationQueue.add('item-approved', event);
```

---

## Aggregate-owned state machine

For complex entities, own the state machine inside the aggregate (see `skill-domain-modeling-patterns.md`).
The aggregate enforces all guards — the service just calls methods and dispatches events.

```typescript
// Service delegates transition to aggregate, then persists + dispatches
const agg = await itemRepo.findById(id, actor.organizationId);
if (!agg) throw new NotFoundError('Item not found');

agg.approve(actor.id); // throws ConflictError or ForbiddenError internally

await prisma.$transaction(async (tx) => {
  await itemRepo.save(agg, tx);
  await auditLogger.log(tx, { action: 'ITEM_APPROVED', entity: 'Item', entityId: id, actorId: actor.id, organizationId: actor.organizationId });
});

const events = agg.pullDomainEvents();
await DomainEventDispatcher.dispatch(events, actor.organizationId);
```

---

## State machine completeness checklist

- [ ] Every enum value appears in the transition table
- [ ] Every transition has an explicit guard
- [ ] Terminal states throw on any transition attempt
- [ ] Optimistic lock (updateMany with current state) on every write transition
- [ ] Self-approval checked on every approval transition
- [ ] Domain event emitted after every successful transition
- [ ] Frontend buttons disabled for impossible transitions
- [ ] Audit log entry written inside the transaction
