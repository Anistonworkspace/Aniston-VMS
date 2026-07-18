# Skill — DDD Bounded Contexts Patterns

For apps with > 10 entities where a single design becomes unreadable. Splits
Aniston VMS's `apps/api` into bounded contexts, each with its own
vocabulary, its own module boundary, and its own team-of-agents ownership.

Complements `skill-domain-modeling-patterns.md` (which covers tactical DDD
inside a context — aggregates, value objects, repositories).

---

## The five bounded contexts

Per `docs/06-implementation-plan.md`, Aniston VMS's `apps/api` is organized
into five contexts. They share one Postgres database (this is a modular
monolith, not microservices — contrast with `services/media` and
`services/image-analysis`, which genuinely are separate deployables, see
`skill-system-design-patterns.md`), but each context owns its own NestJS
module, its own vocabulary, and never reaches into another context's Prisma
models directly.

| Context | Owns | Key entities |
|---|---|---|
| **Monitoring/Health** | Infrastructure inventory + live health signal | `Region`, `Site`, `Zone`, `Camera`, `Router`, `Sim`, `HealthCheck` |
| **Incidents** | Fault lifecycle, alerting, remediation tracking | `Incident`, `IncidentEvent`, `EscalationPolicy`, `EscalationStep`, `AlertRule`, `Notification`, `MaintenanceTask` |
| **Streaming/Playback** | Live view + SD-card recording retrieval | `StreamSession`, `ClipExport`, `SavedLayout`, `CameraPlaybackAdapter` |
| **Reporting** | Aggregation and export, no independent write model | uptime/SLA rollups, `ReportExport`, read-models built from the other four contexts |
| **Identity/RBAC** | Who can do what, where | `User`, `Role`, `UserAccessScope`, `RefreshToken`, `AuditLog` |

```
apps/api/src/modules/
  monitoring/     # Site, Zone, Camera, Router, Sim, HealthCheck
  incidents/      # Incident, EscalationPolicy, AlertRule, Notification, MaintenanceTask
  streaming/      # StreamSession, ClipExport, SavedLayout
  reporting/      # read-only rollups, exports
  identity/       # User, Role, UserAccessScope, AuditLog
```

Rule: a controller or service in one module **never** imports another
module's Prisma model, aggregate, or repository directly. It depends on that
module's exported *service* (via Nest's `exports: []` in the `@Module`
decorator — see `skill-mvc-patterns.md`), or on a translator (ACL) if the
shapes genuinely don't match.

---

## Cross-context event flow: Monitoring/Health → Incidents

The canonical cross-context example in this codebase: the Monitoring/Health
context detects a fault; the Incidents context decides whether that's
actionable and owns everything from there. These two contexts must **not**
share a single `HealthCheckFailed`-does-everything god-service — each has
its own vocabulary.

```typescript
// apps/api/src/modules/monitoring/health-check.service.ts
// Monitoring/Health context — knows about RTSP ports, ONVIF, SIM signal.
// It does NOT know what an "incident" is, what escalation means, or who gets notified.
@Injectable()
export class HealthCheckService {
  constructor(private readonly prisma: PrismaService, private readonly events: DomainEventDispatcher) {}

  async recordResult(cameraId: string, checkType: CheckType, passed: boolean, detail: Json) {
    const check = await this.prisma.healthCheck.create({ data: { cameraId, checkType, passed, detail } });
    if (!passed) {
      this.events.dispatch(new HealthCheckFailedEvent(cameraId, checkType, detail));
    }
    return check;
  }
}
```

```typescript
// apps/api/src/modules/incidents/acl/health-to-incident.acl.ts
// Anti-corruption layer: translates a Monitoring/Health-context event into
// the Incidents context's own vocabulary (a "candidate" the diagnosis
// engine and business rules in skill-business-rules-patterns.md can act on).
// This is the same mechanic as translating a "BookingCompleted" event into
// an "invoice" in a billing context — only the nouns changed.
@Injectable()
export class HealthToIncidentAcl {
  constructor(private readonly incidents: IncidentsService) {}

  @OnEvent('HealthCheckFailedEvent') // handled in apps/api/src/modules/incidents/handlers/onHealthCheckFailed.ts
  async handle(event: HealthCheckFailedEvent) {
    const candidate: IncidentCandidate = {
      cameraId: event.cameraId,
      failedCheckType: event.checkType,
      detail: event.detail,
    };
    await this.incidents.createIncidentForHealthBreach(candidate);
  }
}
```

```typescript
// apps/api/src/modules/incidents/incidents.service.ts (excerpt)
// Incidents context vocabulary: "candidate", "incident", "escalation policy" —
// never "health check" or "RTSP port" directly; those are Monitoring/Health nouns.
async createIncidentForHealthBreach(candidate: IncidentCandidate) {
  const diagnosis = this.diagnosisEngine.diagnose(candidate); // skill-business-rules-patterns.md
  return this.prisma.incident.create({
    data: { cameraId: candidate.cameraId, diagnosis, status: 'DETECTED', incidentNumber: await this.nextIncidentNumber() },
  });
}
```

---

## Identity/RBAC as a boundary: never leak the full `User` row

Every other context needs "who is this" but must never see a password hash,
a refresh-token row, or the full `user_access_scopes` join. Identity exposes
a translated, minimal shape.

```typescript
// apps/api/src/modules/identity/acl/identity.acl.ts
export interface AuthUser {
  id: string;
  role: Role;
  allowedZoneIds: string[];
}

@Injectable()
export class IdentityAcl {
  constructor(private readonly identity: IdentityService) {}

  async toAuthUser(userId: string): Promise<AuthUser> {
    const user = await this.identity.getFullUserForInternalUseOnly(userId); // never exported outside identity/
    return { id: user.id, role: user.role, allowedZoneIds: user.accessScopes.map((s) => s.zoneId) };
  }
}
```

`ScopeGuard` (`skill-mvc-patterns.md`) is the consumer of `IdentityAcl` on
every request — it is how the other four contexts get an `AccessScope`
without ever importing `identity/`'s Prisma models.

---

## Streaming/Playback: hardware differences stay behind one interface

The Streaming/Playback context talks to physically different camera
firmwares (ONVIF-compliant, Hikvision, Dahua/CPPlus, or none at all with SD
playback support). The rest of the codebase — and the other four contexts —
only ever see one interface:

```typescript
// apps/api/src/modules/streaming/adapters/camera-playback.adapter.ts
export interface CameraPlaybackAdapter {
  listSegments(cameraId: string, day: string): Promise<PlaybackSegment[]>;
  getPlaybackUrl(cameraId: string, start: Date, end: Date): Promise<string>;
  supportsScale(): boolean; // some firmwares can't do >1x scrub
}
// Implementations: OnvifPlaybackAdapter, HikvisionPlaybackAdapter,
// DahuaPlaybackAdapter, UnsupportedPlaybackAdapter (graceful "no SD playback" response)
```

---

## Reporting: read-only, no independent write model

Reporting never owns a source-of-truth table for anything the other four
contexts already own. It only builds rollups (uptime %, incident counts,
downtime minutes) by querying across contexts through their exported
services or dedicated read-model views, and exports them
(`docs/05-backend-schema.md` §Reports). If a report needs a number that
doesn't exist yet, that number is added to the owning context — never
computed by reaching into that context's tables directly from Reporting.

---

## When *not* to split further

Don't create a sixth context for "Escalation" or "Notification" separately
from Incidents — they have no independent lifecycle; an `EscalationPolicy`
and a `Notification` only ever exist in service of an `Incident`. Splitting
below the point where a concept has its own vocabulary and its own
persistence lifecycle just adds indirection without adding clarity.