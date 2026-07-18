# Skill — State Machine Patterns

Three state machines run Aniston VMS's core loop: **camera health**,
**incident lifecycle**, and **post-resolution recovery**. Canon:
`docs/02-TRD.md` §3–§4, `docs/05-backend-schema.md`. Enforcement lives in
the `IncidentAggregate` (`skill-domain-modeling-patterns.md`); the rules
that decide *when* a transition should happen live in
`skill-business-rules-patterns.md`.

---

## Define all states and transitions upfront

```typescript
// In incidents.service.ts — document before writing code
/*
 * Incident State Machine
 *
 * DETECTED ──▶ CONFIRMED ──▶ ALERTED ──▶ ACKNOWLEDGED ──▶ ASSIGNED
 *                                                             │
 *                                                             ▼
 *                                                     INVESTIGATING
 *                                                             │
 *                                                             ▼
 *                                                        RESOLVED ──(2 good checks)──▶ RECOVERY_VERIFIED ──▶ CLOSED
 *
 * CLOSED is the only terminal state. Every other state can still receive
 * a fresh health-check failure and re-open a NEW incident (a new
 * incidentNumber) — incidents are never "reopened" in place.
 */
```

```typescript
// Camera Health State Machine (recomputed on every HealthCheck row)
/*
 *          score ≥ 90              50 ≤ score < 90            score < 50
 * UNKNOWN ───────────▶ HEALTHY ◀──────────────────────▶ WARNING ──────────▶ CRITICAL
 *   ▲                     ▲                                │                  │
 *   │                     └────────────────────────────────┘                  │
 *   │                                     ▲                                   │
 *   └─────────────── MAINTENANCE (manual, operator-only, reversible) ◀────────┘
 */
```

Two independent axes, one score: `ConnectionQuality.band` (from
`skill-business-rules-patterns.md`) drives `HEALTHY`/`WARNING`/`CRITICAL`
automatically; `MAINTENANCE` is the one manual override, entered and exited
only by an explicit operator action, never by the scoring pipeline.

---

## Guard functions per transition

Every transition has an explicit guard — a permission check, a role check,
or both — never buried inside the handler body.

```typescript
// apps/api/src/modules/incidents/domain/incident.guards.ts
export const IncidentGuards = {
  canAcknowledge: (status: IncidentStatus) => ['ALERTED', 'CONFIRMED'].includes(status),
  canAssign: (status: IncidentStatus) => status === 'ACKNOWLEDGED',
  canResolve: (status: IncidentStatus) => ['ACKNOWLEDGED', 'ASSIGNED', 'INVESTIGATING'].includes(status),
  canVerifyRecovery: (status: IncidentStatus, goodChecks: number) => status === 'RESOLVED' && goodChecks >= 2,
  canClose: (status: IncidentStatus, role: Role) =>
    status === 'RECOVERY_VERIFIED' && (role === 'PROJECT_ADMIN' || role === 'SUPER_ADMIN'),
  canDoctorMark: (status: IncidentStatus, role: Role, assignedEngineerId: string, actorId: string) =>
    ['ASSIGNED', 'INVESTIGATING'].includes(status) &&
    (role === 'PROJECT_ADMIN' || role === 'SUPER_ADMIN' || (role === 'ENGINEER' && assignedEngineerId === actorId)),
};
```

Only `ENGINEER` (when assigned) or `PROJECT_ADMIN`/`SUPER_ADMIN` may
`doctor-mark` a physical fix on e.g. `CAM-042`; only `PROJECT_ADMIN`/
`SUPER_ADMIN` may `CLOSED` an incident — closing is a sign-off action, not
a routine one.

---

## Side effects per transition

| Transition | Side effects |
|---|---|
| `DETECTED` | Open `incident` row + `incidentNumber` (e.g. `ANI-CAM-2026-000145`), capture fault-frame snapshot, enqueue escalation step 0 |
| `CONFIRMED` | Diagnosis engine result attached (`skill-business-rules-patterns.md`), dependency-suppression check re-run |
| `ALERTED` | First notification sent per `EscalationPolicyService` step 0 (WhatsApp to `SITE_OPERATOR`) |
| `ACKNOWLEDGED` | **Stop all future escalation steps** (`escalationQueue.removeRepeatableByKey`), log actor + timestamp, disable the WhatsApp "Acknowledge" quick-reply button |
| `ASSIGNED` | Notify the assigned `ENGINEER`, start SLA-response timer |
| `INVESTIGATING` | No further notifications unless a new escalation policy is manually triggered |
| `RESOLVED` | Start the 2-consecutive-good-checks recovery window; **not** yet closed, still visible on dashboards as "pending verification" |
| `RECOVERY_VERIFIED` | Compute `downtimeSeconds` (first `DETECTED` timestamp → this timestamp), notify "recovery confirmed" |
| `CLOSED` | Freeze the `IncidentEvent` timeline (no further inserts), feed the report rollup, archive |

---

## Optimistic locking is how the guard is actually enforced

Every transition is written as an `updateMany` whose `where` re-asserts the
allowed source states — this *is* the guard, at the database level, closing
the race between two operators clicking "Acknowledge" at once. Full pattern
in `skill-prisma-patterns.md`.

```typescript
// ✅ CORRECT
const result = await this.prisma.incident.updateMany({
  where: { id, status: { in: ['ALERTED', 'CONFIRMED'] }, zoneId: { in: scope.allowedZoneIds } },
  data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
});
if (result.count === 0) throw new ConflictError('Incident is not in an acknowledgeable state');
```

```typescript
// ❌ WRONG — no re-assertion of source state, a second concurrent request
// silently re-applies the same transition or worse, transitions from CLOSED
await this.prisma.incident.update({ where: { id }, data: { status: 'ACKNOWLEDGED' } });
```

---

## Recovery sub-flow detail

```typescript
// apps/api/src/modules/incidents/incident-recovery.processor.ts
// Runs after every scheduled health-probe result for a camera with an
// open incident in RESOLVED status.
async onHealthCheckResult(incidentId: string, passed: boolean) {
  const incident = await this.repo.findById(incidentId, systemScope);
  incident.recordPostResolutionCheck(passed); // aggregate method, skill-domain-modeling-patterns.md
  await this.repo.save(incident);
  // A single failed check resets consecutiveGoodChecks to 0 — recovery
  // must be TWO IN A ROW, not two total, so a flapping camera doesn't
  // falsely verify.
}
```

---

## Terminal states

`CLOSED` is the only terminal state for `Incident` — there is no
`REOPENED` status; a fault recurring after closure creates a brand-new
`incidentNumber` (this preserves the audit/report history of the original
incident's downtime). `MAINTENANCE` is **not** terminal for `CameraStatus`
— it is always exited back into whatever `HEALTHY`/`WARNING`/`CRITICAL` the
next scored health check computes.

---

## Domain events on every transition

Every transition above emits a domain event (`IncidentAcknowledged`,
`IncidentResolved`, `IncidentRecoveryVerified`, `IncidentClosed` — see
`skill-domain-modeling-patterns.md`), dispatched only after the
`$transaction` that persisted the state change has committed
(`skill-mvc-patterns.md`). Never perform a side effect (send a WhatsApp
message, enqueue a job) *inside* the state-mutating transaction — Redis and
third-party webhooks are not part of the Postgres transaction and must not
be able to roll back or block it.
