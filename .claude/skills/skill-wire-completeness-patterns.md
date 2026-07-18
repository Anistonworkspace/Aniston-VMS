# Skill — Wire-Completeness Patterns

The end-to-end trace every Aniston VMS feature must survive before it can be
marked done. Used by `/verify-wired` and enforced by `agent-code-review` /
`agent-logic-analyzer`.

Unlike a plain CRUD app, a VMS feature's trace is **API → worker → socket →
UI** — an action can fan out into a BullMQ job and a realtime push before it
ever reaches another operator's screen. A feature is only wired when it
survives every hop below, not just the first few.

---

## The full hop trace, in order

| Hop | Layer | What to check | Example |
|---|---|---|---|
| 1 | UI trigger | Button/action exists and calls the right RTK Query hook | `IncidentKanban` "Acknowledge" button → `useAcknowledgeIncidentMutation` |
| 2 | RTK Query | Mutation defined with the correct `query` + tags | `acknowledgeIncident` mutation in `incidents.api.ts` |
| 3 | HTTP | Request actually reaches the API with the right method/path | `POST /api/incidents/:id/acknowledge` |
| 4 | Route mount | NestJS controller + route registered in its module | `IncidentController` mounted by `IncidentModule` |
| 5 | Validation | DTO/pipe validates the body before the handler runs | `AcknowledgeIncidentDto` (class-validator) or a Zod pipe |
| 6 | AuthZ | RBAC guard checks role before the handler runs | `requirePermission(actor, 'incident:acknowledge')` — rejects `CLIENT_VIEWER` |
| 7 | Service | Service method scopes the query to the actor's org/site | `IncidentService.acknowledge(id, actor)` — `where: { id, organizationId: actor.organizationId }` |
| 8 | Persistence + audit | Prisma transaction commits AND `auditLogger.log(...)` fires in the same transaction | `INCIDENT_ACKNOWLEDGED` audit event — not `INCIDENT_CREATED`/`INCIDENT_UPDATED` reused sloppily |
| 9 | Background work | If the action should enqueue a job, the BullMQ job is actually added | `escalationQueue.add('evaluate-escalation', { incidentId })` |
| 10 | Worker | The worker/processor consumes the job and performs its side effect | `EscalationProcessor` sends the WhatsApp/email notification, updates `Escalation` |
| 11 | Realtime push | A socket event is emitted so other connected clients update live | `io.to(orgRoom).emit('incident:updated', { id, status })` |
| 12 | Cache + UI | Frontend refetches via `invalidatesTags` and/or patches the socket payload into the RTK Query cache, and the component re-renders | `IncidentKanban` moves the card's column; `HealthScoreRing` recolors |

---

## Socket → cache wiring (the hop most features miss)

```typescript
// frontend/src/app/socket.ts
socket.on('incident:updated', ({ id }: { id: string }) => {
  dispatch(incidentsApi.util.invalidateTags([{ type: 'Incident', id }, { type: 'Incident', id: 'LIST' }]));
});
```

If this listener doesn't exist, the mutation still "works" for the actor who
clicked it (their own `invalidatesTags` refetch fires), but every *other*
connected viewer — e.g. a `CLIENT_VIEWER` watching the same site's
`LiveWallGrid`, or a `PROJECT_ADMIN` on the `EscalationTimeline` — sees stale
state until their next manual refresh. That's a wire-completeness failure
even though hops 1–9 are green.

---

## Location markers to actually check (don't take "it's fine" on faith)

- **Hop 5/6:** `backend/src/modules/incident/incident.controller.ts` — is the
  guard decorator actually applied to the route, not just imported?
- **Hop 8:** `grep -n "auditLogger.log" backend/src/modules/incident/incident.service.ts`
  — one call per state transition (`INCIDENT_CREATED`, `INCIDENT_ACKNOWLEDGED`,
  `INCIDENT_ESCALATED`, `INCIDENT_RESOLVED`), never a generic catch-all.
- **Hop 9/10:** `backend/src/modules/escalation/escalation.processor.ts` —
  confirm the queue name used by the producer (`escalationQueue.add(...)`)
  matches the `@Processor('escalation')` name exactly. A typo here silently
  drops jobs; BullMQ does not error on an unmatched queue name.
- **Hop 11/12:** every backend `.emit(...)` has a matching frontend
  `socket.on(...)` — `grep -rn "\.emit(" backend/src | grep -v test` vs
  `grep -rn "socket.on(" frontend/src`.

---

## Checklist

- [ ] UI element exists and calls the correct RTK Query hook
- [ ] Mutation has both `providesTags`/`invalidatesTags` set correctly, across entity boundaries where relevant (camera status ↔ incident)
- [ ] Route is mounted (not just defined) in its NestJS module
- [ ] DTO/pipe validation rejects bad input with 400, not 500
- [ ] RBAC guard matches the real role matrix (`SUPER_ADMIN`/`PROJECT_ADMIN`/`CLIENT_VIEWER`) — tested for the *denied* role too
- [ ] Service query is scoped by `organizationId` (and `siteId`/`zoneId` where relevant) — never a global `findMany`
- [ ] Audit log event name is specific to the transition, written inside the same Prisma transaction
- [ ] Any BullMQ job the action should enqueue is actually enqueued, with the queue name matching a live processor
- [ ] Worker side effect (notification sent, `Escalation` row updated, snapshot generated) actually happens — check logs/DB, not just "no error thrown"
- [ ] Socket event is emitted AND a frontend listener consumes it — other connected clients update without a manual refresh
- [ ] A second browser session (different role, same org) sees the same end state after all of the above

Canon: `docs/02-TRD.md` (realtime + worker architecture), `docs/05-backend-schema.md`
(Incident/Escalation/HealthCheck relations), `docs/06-implementation-plan.md`
(per-stage "wired" definition of done).