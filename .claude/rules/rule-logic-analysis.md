---
# Logic Analysis Rules

Always trace the COMPLETE path for every workflow:
  UI component → RTK Query mutation → API route → middleware chain → controller → service → Prisma → DB → socket emit → UI cache invalidation → UI re-render
  Never audit only one layer. A gap at any layer is a bug.

Enum completeness check (do this for every status field):
  List ALL enum values
  Map EVERY value to a handler in the service
  Flag any enum value with no handler as a logic gap

Self-approval check (do this for every approval endpoint):
  Verify: approverId !== requesterId
  If this check is missing, flag it as CRITICAL

Race condition checklist:
  Every multi-step operation MUST use prisma.$transaction
  Check: is the same action safe to submit twice? (idempotency)
  If a button can be double-clicked and it creates two records, that is a bug

Edge cases to check for every service method:
  Resource does not exist → 404
  Resource is soft-deleted (filter: { deletedAt: null }) → 404
  Resource belongs to a different org → 403
  Resource is in the wrong state for this action → 400

Side effects to verify:
  After every status change: is a notification sent?
  After every notification: is a socket event emitted?
  After every socket event: does the UI re-render without a page refresh?
