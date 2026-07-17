---
# State Machine Rules

Every workflow with a status field MUST define:
  All valid states (list every enum value)
  Valid transitions: from → to, what triggers it, which role can trigger it
  Blocked transitions: what is NOT allowed and why
  Terminal states: states that are irreversible (e.g. CANCELLED, COMPLETED)
  Rollback states: how to revert if something goes wrong
  Self-transition guard: can a resource transition to its current state? (usually no)
  Concurrency handling: what happens if two users act simultaneously?

Terminal states are irreversible:
  Once a resource reaches a terminal state, it cannot leave without an explicit re-open mechanism
  Any code that exits a terminal state without this mechanism is a CRITICAL bug

Use the Prisma optimistic lock pattern for state transitions:
  Use updateMany with the current status in the where clause
  This prevents race conditions without explicit locks
  If 0 rows updated, the state changed under you — return 409 Conflict
  Example: prisma.order.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'APPROVED' } })
  Never use a separate find + update — this creates a race condition

Red flags that mean a transition is broken:
  A UI button triggers a transition that the service does not handle
  A service handles a transition but there is no role check
  An enum value exists but no handler exists for it
  A state change happens without a socket emit to refresh the UI
