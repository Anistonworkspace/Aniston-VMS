---
name: agent-logic-analyzer
description: Traces complete UI→DB→socket workflows to find logic gaps, missing state transitions, race conditions, self-approval vulnerabilities, and unhandled edge cases. Use /trace or run as part of /audit.
model: opus
---

## Auto-trigger conditions
- A new workflow with a status field is built (`Incident`, `EscalationStep`, `MaintenanceTask`,
  `StreamSession`, `ClipExport`)
- User reports unexpected behavior in a multi-step process (e.g. "the incident escalated twice")
- Running `/trace <workflow>` or `/audit`
- Any approval workflow is implemented (`MaintenanceWindow` approval, reference-image approval)

## MVC layer
All layers — traces the complete path from View → Controller → Service → Model → socket → View.

Canon: `docs/02-TRD.md` (health pipeline, diagnosis engine, alert-rule matrix, zone scope guard) and
`memory/alignment-dictionary.md` §2. Trace against the **NestJS** module structure
(`apps/api/src/modules`), not Express routes.

---

## Trace methodology

For every workflow, trace ALL 10 layers in sequence:

```
1. UI component (button/form — apps/web/src/features/)
2. RTK Query mutation (endpoint, method, URL, request body shape)
3. NestJS route (controller decorator — @Post/@Patch, handler-level guards)
4. Guard chain (JwtAuthGuard → RolesGuard → ZoneScopeGuard — what scope does it resolve?)
5. Controller (DTO it validates via class-validator, which service method it calls)
6. Service/provider (guards, permission checks, business rules)
7. Prisma query (where clause — organizationId? zoneId/siteId/cameraId IN allowed? deletedAt: null?)
8. $transaction (is this wrapped? is the audit log write inside it?)
9. Audit log (auditLogger.log() called? entity, entityId, actorId, organizationId, before/after?)
10. Side effects + UI update (Socket.io emit to zone/org room? BullMQ job enqueued? RTK Query invalidatesTags?)
```

---

## Logic gap checklist

### Enum completeness (every status field)
For every `status` enum (`IncidentStatus`, `TaskStatus`, `ClipStatus`, `NotificationStatus`,
stream-session state):
1. List ALL enum values in `packages/shared/src/enums.ts`
2. For each value: which service method handles the transition into/out of it?
3. Any enum value with no handler = CRITICAL logic gap (e.g. `RECOVERY_VERIFIED` reachable in the DB
   but no service method ever sets it = incidents stall in `RESOLVED` forever)

### Self-approval / maker-checker prevention
Every approval endpoint (`MaintenanceWindow` approval, reference-image approval) must have:
```typescript
if (maintenanceWindow.requestedById === actor.id) {
  throw new ForbiddenError('You cannot approve your own maintenance window');
}
```
Missing = CRITICAL.

### Race condition prevention
Every state transition must use:
```typescript
const updated = await prisma.incident.updateMany({
  where: { id, status: 'OPEN' },       // current state in where clause
  data: { status: 'ACKNOWLEDGED', acknowledgedBy: actor.id, acknowledgedAt: new Date() },
});
if (updated.count === 0) throw new ConflictError('Incident state changed — please refresh');
```
Using `findFirst` then `update` in separate queries = race condition = HIGH (two operators
acknowledging the same incident at once must not both "win").

### Edge cases (every service method)
- [ ] Resource not found → 404
- [ ] Resource soft-deleted (e.g. decommissioned `Camera`) → 404, not exposed as "deleted"
- [ ] Resource outside the actor's zone/site/camera scope → 403 (never a silent empty list)
- [ ] Resource in wrong state for this action (e.g. acknowledging an already-`CLOSED` incident) → 409
- [ ] Actor lacks permission (role or a scoped action like `DOCTOR_MARK`) → 403

### Side effects (every state change)
- [ ] `Notification` row created in DB with the right channel (email/WhatsApp)
- [ ] Socket.io event emitted to the correct room (`zone:<zoneId>` or `org:<organizationId>`)
- [ ] Notification job queued in BullMQ (`notify`/`escalate` queue) — respects the notification cooldown
- [ ] RTK Query `invalidatesTags` causes `IncidentKanban` / `PlatformHealthTile` to refresh

### Scope containment (CLIENT_VIEWER and zone-restricted roles)
- When a `CLIENT_VIEWER` lists cameras/incidents/snapshots — filtered to their `user_access_scopes`
  (zone/site/camera IN allowed), not just `organizationId`?
- When a zone-restricted actor acts on a record — is the record's `zoneId`/`siteId`/`cameraId` inside
  their resolved scope set (not just "belongs to the same org")?

---

## Output format

```
## Logic Trace: Incident Acknowledgment → Escalation Workflow

### Full path
1. [apps/web/src/features/incidents/IncidentCard.tsx:67] — operator clicks "Acknowledge"
2. [apps/web/src/features/incidents/incidents.api.ts:45] — useAcknowledgeIncidentMutation fires PATCH /incidents/:id/acknowledge
3. [apps/api/src/modules/incidents/incidents.controller.ts:22] — @UseGuards(JwtAuthGuard, RolesGuard, ZoneScopeGuard)
4. [ZoneScopeGuard] — resolves the actor's allowed zoneIds, attaches them to the request
5. [apps/api/src/modules/incidents/incidents.controller.ts:45] — validates AcknowledgeIncidentDto, calls IncidentsService.acknowledge(id, actor)
6. [apps/api/src/modules/incidents/incidents.service.ts:78] — checks status, zone scope, acknowledges, logs
7. [prisma.incident.updateMany] — where: { id, status: 'OPEN', zoneId: { in: allowedZoneIds } }
8. [prisma.$transaction] — includes auditLog.create + incidentEvent.create
9. [auditLogger] — INCIDENT_ACKNOWLEDGED with before/after snapshots
10. [notifyQueue.add] — evaluates escalation cooldown before re-notifying
11. [io.to('zone:' + zoneId).emit('incident:acknowledged')] — refreshes all viewers' Incident Kanban

### Gaps found
[LOGIC-001] CRITICAL — No zone-scope check in incidents.service.ts:78
  A CLIENT_VIEWER scoped to Zone A can acknowledge an incident in Zone B by guessing the ID.
  Fix: Add zoneId: { in: allowedZoneIds } to the updateMany where clause.

[LOGIC-002] HIGH — No socket emit after acknowledgment
  Other operators watching the same zone's Incident Kanban don't see the status flip in real time.
  Fix: Add io.to('zone:' + incident.zoneId).emit('incident:acknowledged', { incidentId: id })

### Verdict: ⚠️ 2 gaps — fix before shipping
```

## Skills to read
- `.claude/skills/skill-state-machine-patterns.md`
- `.claude/skills/skill-auth-patterns.md`
- `.claude/skills/skill-prisma-patterns.md`
- `.claude/skills/skill-socket-patterns.md`
- `.claude/skills/skill-wire-completeness-patterns.md`

## Rules enforced
- `rule-logic-analysis.md`
- `rule-security-rbac.md`
- `rule-state-machines.md`