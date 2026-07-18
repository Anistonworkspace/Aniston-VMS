# /trace — Full End-to-End Workflow Trace

Invokes `agent-logic-analyzer` to trace a complete Aniston VMS workflow from the trigger (UI click or
background probe) all the way through to the database, background workers, realtime push, and back,
exposing any gaps, missing validations, or unhandled states.

---

## Usage

```
/trace <workflow>
```

Examples:
- `/trace health-probe to incident`
- `/trace incident escalation and notify`
- `/trace camera onboarding`
- `/trace login and token refresh`
- `/trace incident acknowledge`
- `/trace clip export`
- `/trace role/zone-scope change by admin`

---

## What gets traced

Every layer in sequence. Two shapes exist in Aniston VMS — trace whichever applies:

**A. User-triggered mutation** (e.g. acknowledge an incident, onboard a camera):

```
User action
  → React component (which button/form)
    → RTK Query mutation hook (which endpoint, what tags invalidated)
      → NestJS route (method, path, guard chain)
        → Controller (DTO validation)
          → Service (business logic, organizationId + zone-scope checks)
            → Prisma (exact query with all where clauses)
              → Database (table, indexes used)
                → AuditLog entry written
                  → BullMQ job enqueued (if applicable)
                    → Socket.io event emitted (if any)
                      → RTK Query cache invalidated
                        → UI re-renders with new data
```

**B. Worker-triggered background workflow** (e.g. health-probe → incident → escalation → notify):

```
BullMQ health-probe job (RTSP probe / TCP port check / ONVIF query / router ping / SIM signal)
  → HealthCheck row written (diagnosis code from the catalog, e.g. CAMERA_TIMEOUT, INVALID_CREDENTIALS)
    → CameraStatus transition evaluated (sustained pattern, not a single probe)
      → Incident opened/updated (OPEN) if the diagnosis crosses the incident threshold
        → AuditLog entry written (INCIDENT_CREATED)
          → Socket.io event emitted to org:<orgId> / zone:<zoneId> room
            → Live wall re-renders (HealthScoreRing, IncidentKanban) without a page refresh
              → If unacknowledged past SLA: EscalationProcessor enqueues on escalationQueue
                → Escalation row created, Notification sent (WhatsApp/email)
                  → AuditLog entry written (INCIDENT_ESCALATED)
                    → Recovery verification sub-machine gates the eventual RESOLVED transition
```

---

## What it checks at each layer

| Layer | Checks |
|-------|--------|
| UI | Is the button/form wired? Does it show loading state? Error state? |
| RTK Query | Are `invalidatesTags`/`providesTags` correct? Will the live wall / incident board refresh after the mutation or socket push? |
| Route | Is the guard chain correct: `JwtAuthGuard → RolesGuard → ZoneScopeGuard → ValidationPipe → controller`? |
| Controller | Is it thin (no Prisma, no business logic)? Does validation reject bad input with 400? |
| Service | Is `organizationId` (and zone/site scope) taken from the authenticated actor, never from the request body? Is `prisma.$transaction` used for multi-table writes? Is `auditLogger.log(...)` called inside it? |
| Prisma | Does every query include `organizationId`? Does every query include `{ deletedAt: null }`? Is `updateMany` with a status guard used for state transitions (optimistic lock)? |
| Permissions | Does `packages/shared/src/permissions.ts` include this action for the roles that should have it (and exclude the ones that shouldn't)? |
| Self-approval | If this is an acknowledge/escalate/resolve workflow, is `approverId !== requesterId` checked where a second-check is required? |
| State machine | Are only valid `CameraStatus`/`IncidentStatus` transitions allowed (`rule-state-machines.md`)? Is `RECOVERY_VERIFIED` system-set only? Is `CLOSED` terminal except for `REOPENED`? |
| Background job | Is the right BullMQ queue used (`HEALTH_CHECK_QUEUE`/`SNAPSHOT_QUEUE`/`NOTIFICATION_QUEUE`/`ESCALATION_QUEUE`)? Does a matching processor actually consume it? |
| Realtime | Is a Socket.io event emitted AFTER the transaction commits? Is there a matching frontend `socket.on(...)` listener? |
| Audit log | Is the action, entity, `entityId`, `actorId`, `organizationId` all recorded with a specific event name (not a generic catch-all)? |

---

## Output format

```
## Trace: [Workflow Name]

### Full path
1. [apps/web/src/features/incidents/IncidentKanban.tsx:42] — operator clicks "Acknowledge"
2. [apps/web/src/features/incidents/incidents.api.ts:18] — useAcknowledgeIncidentMutation fires PATCH /api/incidents/:id/acknowledge
3. [apps/api/src/modules/incidents/incidents.controller.ts:28] — JwtAuthGuard → RolesGuard → ZoneScopeGuard → ValidationPipe(AcknowledgeIncidentDto) → IncidentsController.acknowledge
4. [apps/api/src/modules/incidents/incidents.service.ts:45] — updateMany({ where: { id, organizationId, status: 'OPEN' }, data: { status: 'ACKNOWLEDGED', acknowledgedById } }) inside $transaction, calls auditLogger.log
5. [prisma/schema.prisma — Incident model] — UPDATE scoped by organizationId, optimistic-lock guard on status
6. [apps/api/src/modules/audit/audit.service.ts] — logs INCIDENT_ACKNOWLEDGED event
7. [apps/api/src/modules/incidents/incidents.gateway.ts] — emits 'incident:updated' to org:<orgId> room

### Gaps found
- [LOGIC-001] Missing invalidatesTags in incidents.api.ts — IncidentKanban column will not move for other connected viewers until manual refresh
- [LOGIC-002] Self-approval check missing in incidents.service.ts:45 — the escalating admin can also acknowledge without a second reviewer

### Verdict
✅ Complete / ⚠️ Has gaps (fix before shipping)
```

---

## Rules that apply
- `.claude/rules/rule-logic-analysis.md` — full trace methodology
- `.claude/rules/rule-security-rbac.md` — organizationId, zone scope, IDOR, self-approval
- `.claude/rules/rule-state-machines.md` — transition validation
- `.claude/rules/rule-audit-standards.md` — finding ID format (`LOGIC-NNN`)
