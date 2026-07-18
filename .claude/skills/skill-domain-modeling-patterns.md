# Skill: Domain Modeling Patterns (DDD)

Tactical DDD for Aniston VMS: aggregates, value objects, domain events,
repositories, anti-corruption layers. Complements
`skill-ddd-bounded-contexts-patterns.md` (which covers where a context's
boundary sits) and `skill-state-machine-patterns.md` (which covers the
transition table this file's aggregate enforces). Canon: `docs/05-backend-schema.md`,
`docs/02-TRD.md` §4.

---

## Aggregate pattern

An aggregate is a cluster of objects treated as a single unit for data
changes. The **aggregate root** is the only object external code may
reference directly — nobody outside the `Incident` aggregate mutates an
`IncidentEvent` row directly.

```typescript
// packages/shared/src/domain/aggregate-root.ts
export abstract class AggregateRoot<T> {
  private domainEvents: DomainEvent[] = [];
  protected constructor(public readonly id: T) {}

  protected addDomainEvent(event: DomainEvent) {
    this.domainEvents.push(event);
  }

  pullDomainEvents(): DomainEvent[] {
    const events = [...this.domainEvents];
    this.domainEvents = [];
    return events;
  }
}
```

### The `Incident` aggregate

`Incident` is the richest aggregate in Aniston VMS: it owns its
`IncidentEvent` timeline, enforces the state machine from
`skill-state-machine-patterns.md`, and is the only place the
"acknowledge stops escalation" / "two consecutive good checks before
recovery-verified" rules are allowed to live.

```typescript
// apps/api/src/modules/incidents/domain/incident.aggregate.ts
import { AggregateRoot } from '@aniston-vms/shared';
import { ConflictError, ForbiddenError } from '../../../common/errors/domain-errors';
import { IncidentAcknowledged, IncidentResolved, IncidentRecoveryVerified, IncidentClosed } from './incident.events';

export type IncidentStatus =
  | 'DETECTED' | 'CONFIRMED' | 'ALERTED' | 'ACKNOWLEDGED'
  | 'ASSIGNED' | 'INVESTIGATING' | 'RESOLVED' | 'RECOVERY_VERIFIED' | 'CLOSED';

export class IncidentAggregate extends AggregateRoot<string> {
  private constructor(
    id: string,
    public readonly incidentNumber: string, // e.g. "ANI-CAM-2026-000145"
    public readonly cameraId: string,
    private status: IncidentStatus,
    private consecutiveGoodChecks: number,
  ) {
    super(id);
  }

  static reconstitute(row: IncidentRow): IncidentAggregate {
    return new IncidentAggregate(row.id, row.incidentNumber, row.cameraId, row.status, row.consecutiveGoodChecks);
  }

  get currentStatus() { return this.status; }

  acknowledge(actorId: string) {
    if (!['ALERTED', 'CONFIRMED'].includes(this.status)) {
      throw new ConflictError(`Cannot acknowledge ${this.incidentNumber} from status ${this.status}`);
    }
    this.status = 'ACKNOWLEDGED';
    this.addDomainEvent(new IncidentAcknowledged(this.id, actorId));
  }

  resolve(actorId: string) {
    if (!['ACKNOWLEDGED', 'ASSIGNED', 'INVESTIGATING'].includes(this.status)) {
      throw new ConflictError(`Cannot resolve ${this.incidentNumber} from status ${this.status}`);
    }
    this.status = 'RESOLVED';
    this.consecutiveGoodChecks = 0;
    this.addDomainEvent(new IncidentResolved(this.id, actorId));
  }

  /** Called by the health-probe pipeline after RESOLVED — see skill-workflow-orchestration-patterns.md */
  recordPostResolutionCheck(passed: boolean) {
    if (this.status !== 'RESOLVED') return;
    this.consecutiveGoodChecks = passed ? this.consecutiveGoodChecks + 1 : 0;
    if (this.consecutiveGoodChecks >= 2) {
      this.status = 'RECOVERY_VERIFIED';
      this.addDomainEvent(new IncidentRecoveryVerified(this.id));
    }
  }

  close(actorId: string, role: 'PROJECT_ADMIN' | 'SUPER_ADMIN' | string) {
    if (this.status !== 'RECOVERY_VERIFIED') {
      throw new ConflictError(`Cannot close ${this.incidentNumber} before recovery is verified`);
    }
    if (role !== 'PROJECT_ADMIN' && role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only PROJECT_ADMIN or SUPER_ADMIN may close an incident');
    }
    this.status = 'CLOSED';
    this.addDomainEvent(new IncidentClosed(this.id, actorId));
  }
}
```

Notice what's **not** here: no Prisma import, no HTTP status codes, no
`req.user`. The aggregate only knows domain rules and domain errors; the
service layer (`skill-mvc-patterns.md`) translates `ConflictError` to
HTTP 409 and persists via the repository below.

---

## Value objects

A value object has no identity — two instances with the same data are
interchangeable — and validates itself at construction so an invalid one
can never exist inside the system.

```typescript
// packages/shared/src/domain/incident-number.vo.ts
const PATTERN = /^ANI-CAM-\d{4}-\d{6}$/; // e.g. "ANI-CAM-2026-000145"

export class IncidentNumber {
  private constructor(public readonly value: string) {}

  static create(raw: string): IncidentNumber {
    if (!PATTERN.test(raw)) throw new ValidationError(`Invalid incident number: ${raw}`);
    return new IncidentNumber(raw);
  }

  static next(year: number, sequence: number): IncidentNumber {
    return new IncidentNumber(`ANI-CAM-${year}-${String(sequence).padStart(6, '0')}`);
  }
}

// packages/shared/src/domain/connection-quality.vo.ts
export class ConnectionQuality {
  private constructor(public readonly score: number) {}

  static create(raw: number): ConnectionQuality {
    if (raw < 0 || raw > 100 || Number.isNaN(raw)) throw new ValidationError(`Score out of range: ${raw}`);
    return new ConnectionQuality(Math.round(raw));
  }

  get band(): 'HEALTHY' | 'WARNING' | 'CRITICAL' {
    if (this.score >= 90) return 'HEALTHY';
    if (this.score >= 50) return 'WARNING';
    return 'CRITICAL';
  }
}
```

`EncryptedCredential` (wrapping `mainRtspUrlEnc`) is also a value object: it
exposes `.encrypt()`/`.decrypt()` and refuses to be constructed from a
plaintext RTSP URL without a key — see `skill-prisma-patterns.md` for where
it's allowed to be decrypted.

---

## Repository pattern

The repository is the only thing that knows how to turn Prisma rows into an
`IncidentAggregate` and back. Services depend on the repository interface,
never on `PrismaService` directly, when working with an aggregate that has
real invariants (contrast with simple read-models like a `Site` list, which
can query Prisma directly — not everything needs a repository).

```typescript
// apps/api/src/modules/incidents/domain/incident.repository.ts
export interface IncidentRepository {
  findById(id: string, scope: AccessScope): Promise<IncidentAggregate>;
  save(incident: IncidentAggregate): Promise<void>;
}

@Injectable()
export class PrismaIncidentRepository implements IncidentRepository {
  constructor(private readonly prisma: PrismaService, private readonly dispatcher: DomainEventDispatcher) {}

  async findById(id: string, scope: AccessScope): Promise<IncidentAggregate> {
    const row = await this.prisma.incident.findFirst({ where: { id, zoneId: { in: scope.allowedZoneIds } } });
    if (!row) throw new NotFoundError('Incident', id);
    return IncidentAggregate.reconstitute(row);
  }

  async save(incident: IncidentAggregate): Promise<void> {
    await this.prisma.incident.update({
      where: { id: incident.id },
      data: { status: incident.currentStatus },
    });
    const events = incident.pullDomainEvents();
    for (const event of events) await this.dispatcher.dispatch(event); // after commit, per skill-mvc-patterns.md
  }
}
```

---

## Domain event dispatcher

```typescript
// packages/shared/src/domain/domain-event-dispatcher.ts
@Injectable()
export class DomainEventDispatcher {
  private handlers = new Map<string, Array<(e: DomainEvent) => Promise<void>>>();

  register(eventName: string, handler: (e: DomainEvent) => Promise<void>) {
    const list = this.handlers.get(eventName) ?? [];
    list.push(handler);
    this.handlers.set(eventName, list);
  }

  async dispatch(event: DomainEvent) {
    for (const handler of this.handlers.get(event.constructor.name) ?? []) await handler(event);
  }
}
```

Registered handlers, e.g. in `incident.event-handlers.ts`:

- `IncidentAcknowledged` → cancel the pending escalation repeat job
  (`escalationQueue.removeRepeatableByKey`).
- `IncidentResolved` → nothing queued yet; the health-probe pipeline itself
  calls `recordPostResolutionCheck` on the next scheduled check.
- `IncidentRecoveryVerified` → enqueue `notifications` job "recovery
  confirmed", compute `downtimeSeconds` for the report rollup.
- `IncidentClosed` → write the final `AuditLog` row, freeze the
  `IncidentEvent` timeline from further inserts.

---

## Anti-corruption layer (ACL)

When one bounded context needs data shaped by another (see
`skill-ddd-bounded-contexts-patterns.md`), it never imports that context's
Prisma model or aggregate directly — it goes through a small translator that
owns the impedance mismatch.

```typescript
// apps/api/src/modules/reporting/acl/incident-reporting.acl.ts
// Translates the Incidents context's IncidentAggregate into the Reporting
// context's own read-model shape — Reporting doesn't need to know about
// consecutiveGoodChecks or the full state machine, only the fields it reports on.
export interface IncidentReportLine {
  incidentNumber: string;
  cameraCode: string;
  diagnosis: string;
  downtimeSeconds: number;
}

@Injectable()
export class IncidentReportingAcl {
  toReportLine(incident: IncidentWithCamera): IncidentReportLine {
    return {
      incidentNumber: incident.incidentNumber,
      cameraCode: incident.camera.cameraCode,
      diagnosis: incident.diagnosis,
      downtimeSeconds: incident.downtimeSeconds ?? 0,
    };
  }
}
```

This is the same shape as the `IamUser`→`AuthUser` boundary crossing
described in `skill-ddd-bounded-contexts-patterns.md`: Identity's full user
row (with password hash, refresh tokens) never crosses into another
context — only a translated, minimal `AuthUser { id, role, allowedZoneIds }`
does.