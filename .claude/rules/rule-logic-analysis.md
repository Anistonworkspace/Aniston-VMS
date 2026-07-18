---
# Logic Analysis Rules
Canon: memory/alignment-dictionary.md §2 (status/diagnosis code catalog), docs/02-TRD.md.

Always trace the COMPLETE path for every workflow:
  UI component → RTK Query mutation → NestJS controller → guard/pipe chain (`JwtAuthGuard` → `RolesGuard`/
  `ZoneScopeGuard` → `ValidationPipe`) → service (provider) → Prisma → DB → BullMQ job or WebSocket emit →
  UI cache invalidation → UI re-render
  Never audit only one layer. A gap at any layer is a bug — e.g. a camera going `CAMERA_OFFLINE` in the DB
  with no corresponding Incident, or an Incident created with no socket emit to the live incident board.

Enum completeness check (do this for every status field):
  List ALL enum values (`CameraStatus`, `IncidentStatus`, `ClipStatus`, `TaskStatus`, `NotificationStatus`, …)
  Map EVERY value to a handler in the service
  Flag any enum value with no handler as a logic gap — e.g. a `CAMERA_PORT_CLOSED` diagnosis code that never
  triggers an incident, or an `IncidentStatus.ESCALATED` with no escalation-policy handler

Self-approval check (do this for every approval/sign-off endpoint):
  Verify: the user resolving/closing an Incident or approving an Escalation is not the same user who
  raised/escalated it when a second-check is required (`approverId !== requesterId`)
  If this check is missing, flag it as CRITICAL

Race condition checklist:
  Every multi-step operation MUST use `prisma.$transaction`
  Check: is the same action safe to submit twice? (idempotency) — e.g. does double-clicking "Acknowledge"
  on an incident create two AuditLog rows or send two duplicate WhatsApp/email notifications?
  If a button can be double-clicked and it creates two records, that is a bug

Edge cases to check for every service method:
  Resource does not exist → 404
  Resource is soft-deleted (filter: `{ deletedAt: null }`) → 404
  Resource belongs to a different organization → 403
  Resource is outside the requester's zone scope (site/zone/camera not in their `UserAccessScope`) → 403
  Resource is in the wrong state for this action → 400 (e.g. acknowledging an already-CLOSED incident)

Side effects to verify:
  After every camera health status change: is an Incident opened/updated?
  After every Incident status change: is a Notification sent (email/SMS/WhatsApp) per the escalation policy?
  After every Notification: is a socket event emitted?
  After every socket event: does the UI (live wall, incident board) re-render without a page refresh?