# Skill: Business Rules Patterns

Health → incident → escalation rules for Aniston VMS. Canon:
`docs/02-TRD.md` §3 (root-cause diagnosis table) and §4 (escalation timing).
Complements `skill-state-machine-patterns.md` (the transitions these rules
gate) and `skill-domain-modeling-patterns.md` (the aggregate they run
inside).

---

## Specification pattern

A Specification is a single-purpose, combinable predicate that encodes one
business rule. Name every spec after the rule it checks — never
`checkThing1Spec`.

```typescript
// packages/shared/src/domain/specification.ts
export interface Specification<T> {
  isSatisfiedBy(candidate: T): boolean;
  and(other: Specification<T>): Specification<T>;
  or(other: Specification<T>): Specification<T>;
  not(): Specification<T>;
}

export abstract class CompositeSpecification<T> implements Specification<T> {
  abstract isSatisfiedBy(candidate: T): boolean;
  and(other: Specification<T>) { return new AndSpecification(this, other); }
  or(other: Specification<T>) { return new OrSpecification(this, other); }
  not() { return new NotSpecification(this); }
}

class AndSpecification<T> extends CompositeSpecification<T> {
  constructor(private a: Specification<T>, private b: Specification<T>) { super(); }
  isSatisfiedBy(c: T) { return this.a.isSatisfiedBy(c) && this.b.isSatisfiedBy(c); }
}
class OrSpecification<T> extends CompositeSpecification<T> {
  constructor(private a: Specification<T>, private b: Specification<T>) { super(); }
  isSatisfiedBy(c: T) { return this.a.isSatisfiedBy(c) || this.b.isSatisfiedBy(c); }
}
class NotSpecification<T> extends CompositeSpecification<T> {
  constructor(private a: Specification<T>) { super(); }
  isSatisfiedBy(c: T) { return !this.a.isSatisfiedBy(c); }
}
```

---

## Specs that gate "should we raise an incident?"

```typescript
// apps/api/src/modules/incidents/domain/specs/is-consecutive-failure-threshold-met.spec.ts
// TRD §3: raise after 3 consecutive failed probes OR 5 minutes continuously offline
export class IsConsecutiveFailureThresholdMetSpec extends CompositeSpecification<IncidentCandidate> {
  isSatisfiedBy(c: IncidentCandidate) {
    return c.consecutiveFailures >= 3 || c.continuousOfflineSeconds >= 300;
  }
}

// apps/api/src/modules/incidents/domain/specs/is-in-maintenance-window.spec.ts
export class IsInMaintenanceWindowSpec extends CompositeSpecification<IncidentCandidate> {
  isSatisfiedBy(c: IncidentCandidate) {
    return c.camera.status === 'MAINTENANCE';
  }
}

// apps/api/src/modules/incidents/domain/specs/has-dependency-incident.spec.ts
// A router-level incident suppresses new camera-level incidents for every
// camera behind that router — don't fire 12 SITE_INTERNET_DOWN incidents
// for one dead router.
export class HasDependencyIncidentSpec extends CompositeSpecification<IncidentCandidate> {
  constructor(private openRouterIncidentCameraIds: Set<string>) { super(); }
  isSatisfiedBy(c: IncidentCandidate) {
    return this.openRouterIncidentCameraIds.has(c.cameraId);
  }
}

// apps/api/src/modules/incidents/domain/specs/is-recovery-confirmed.spec.ts
// TRD §4: two consecutive successful checks after RESOLVED before RECOVERY_VERIFIED
export class IsRecoveryConfirmedSpec extends CompositeSpecification<IncidentCandidate> {
  isSatisfiedBy(c: IncidentCandidate) {
    return c.consecutiveGoodChecks >= 2;
  }
}
```

Composed once, in one place, never re-derived inline in a controller:

```typescript
const shouldRaiseIncident = new IsConsecutiveFailureThresholdMetSpec()
  .and(new IsInMaintenanceWindowSpec().not())
  .and(new HasDependencyIncidentSpec(openRouterIncidentCameraIds).not());

if (shouldRaiseIncident.isSatisfiedBy(candidate)) {
  await this.incidents.createIncidentForHealthBreach(candidate);
}
```

```typescript
// ❌ WRONG — the rule is unreadable, untestable in isolation, and gets
// copy-pasted slightly-wrong into a second place next sprint
if (candidate.consecutiveFailures >= 3 && candidate.camera.status !== 'MAINTENANCE' && !openRouterIncidentCameraIds.has(candidate.cameraId)) {
  await this.incidents.createIncidentForHealthBreach(candidate);
}
```

---

## Diagnosis engine: first-matching-spec-wins, in priority order

TRD §3's root-cause table is a priority-ordered list of specs, each mapped
to one `Diagnosis` value. Encoding it this way means a new failure pattern
is a new spec + one line in the table, not a rewritten `if/else` chain.

```typescript
// apps/api/src/modules/incidents/domain/diagnosis-engine.ts
type DiagnosisRule = { spec: Specification<IncidentCandidate>; diagnosis: Diagnosis };

@Injectable()
export class DiagnosisEngine {
  private readonly rules: DiagnosisRule[] = [
    { spec: new RouterUnreachableSpec(), diagnosis: 'SITE_INTERNET_DOWN' },
    { spec: new SimSignalWeakSpec(), diagnosis: 'SIM_SIGNAL_ISSUE' },
    { spec: new AlternatingPassFailSpec(), diagnosis: 'NETWORK_UNSTABLE' },
    { spec: new CameraPortClosedSpec(), diagnosis: 'CAMERA_OFFLINE' },
    { spec: new RtspAuthFailedSpec(), diagnosis: 'CONFIG_ERROR' },
    { spec: new LowFpsOrWrongCodecSpec(), diagnosis: 'STREAM_DEGRADED' },
    { spec: new ImageMetricFailingSpec(), diagnosis: 'IMAGE_PROBLEM' },
  ];

  diagnose(candidate: IncidentCandidate): Diagnosis {
    const match = this.rules.find((rule) => rule.spec.isSatisfiedBy(candidate));
    return match?.diagnosis ?? 'CAMERA_OFFLINE'; // conservative default
  }
}
```

Order matters: `RouterUnreachableSpec` is checked before `CameraPortClosedSpec`
because a dead router explains every camera behind it going dark —
diagnosing each one as `CAMERA_OFFLINE` would send an operator chasing 12
cameras instead of one router.

---

## Policy object: escalation timing

A policy object encapsulates a decision that has more than one input and
more than one possible shape of answer — not a boolean, a plan.

```typescript
// apps/api/src/modules/incidents/domain/escalation-policy.ts
export interface EscalationDecision {
  afterMinutes: number;
  recipientLevel: 'SITE_OPERATOR' | 'ZONE_ENGINEER' | 'PROJECT_ADMIN';
  channels: Array<'EMAIL' | 'WHATSAPP'>;
}

// TRD §4 default ladder: 0 / 10 / 20 / 30 / 60 minutes, escalating recipient level.
// A zone can override the ladder via zone_alert_recipients + a custom EscalationPolicy row.
@Injectable()
export class EscalationPolicyService {
  private readonly defaultSteps: EscalationDecision[] = [
    { afterMinutes: 0, recipientLevel: 'SITE_OPERATOR', channels: ['WHATSAPP'] },
    { afterMinutes: 10, recipientLevel: 'SITE_OPERATOR', channels: ['EMAIL', 'WHATSAPP'] },
    { afterMinutes: 20, recipientLevel: 'ZONE_ENGINEER', channels: ['EMAIL', 'WHATSAPP'] },
    { afterMinutes: 30, recipientLevel: 'ZONE_ENGINEER', channels: ['EMAIL', 'WHATSAPP'] },
    { afterMinutes: 60, recipientLevel: 'PROJECT_ADMIN', channels: ['EMAIL', 'WHATSAPP'] },
  ];

  resolveStepsFor(zone: Zone, override?: EscalationPolicyRow): EscalationDecision[] {
    return override?.steps ?? this.defaultSteps;
  }
}
```

---

## Domain service for cross-aggregate, pure-function rules

A domain service holds a rule that doesn't belong to any single aggregate —
it takes several values, computes one answer, and touches no I/O.

```typescript
// packages/shared/src/domain/connection-quality.domain-service.ts
// TRD §3: weighted score — success-rate 40%, median latency 20%, jitter 15%, signal 25%
export class ConnectionQualityDomainService {
  static score(input: {
    successRatePct: number;
    medianLatencyScore: number;
    jitterScore: number;
    signalScore: number;
  }): ConnectionQuality {
    const raw =
      input.successRatePct * 0.4 +
      input.medianLatencyScore * 0.2 +
      input.jitterScore * 0.15 +
      input.signalScore * 0.25;
    return ConnectionQuality.create(raw);
  }
}
```

Pure, synchronous, no `PrismaService` dependency — this is exactly why it's
trivial to unit-test every score band without mocking a database.

---

## Value objects guard rule inputs

```typescript
// packages/shared/src/domain/percentage.vo.ts
export class Percentage {
  private constructor(public readonly value: number) {}
  static of(raw: number): Percentage {
    if (raw < 0 || raw > 100) throw new ValidationError(`Percentage out of range: ${raw}`);
    return new Percentage(raw);
  }
}
```

A spec or domain service should never receive a raw, unvalidated number for
something that has rule-relevant bounds (a percentage, a duration in
minutes) — construct the value object first, so an invalid value can't even
be expressed, let alone silently misapply a rule.

---

## Anti-pattern: rule logic scattered across the codebase

Don't let `if (failCount >= 3 && !inMaintenanceWindow)` show up inline in a
controller, a BullMQ processor, *and* a report query with three slightly
different thresholds. Every rule from `docs/02-TRD.md` §3–§4 gets exactly
one named spec or policy object, referenced everywhere it's needed — that's
what makes the diagnosis engine (and an auditor, six months later) able to
trust that `ANI-CAM-2026-000145` was diagnosed `SITE_INTERNET_DOWN` for a
reason that's still in the code, not just in someone's memory of the
original ticket.