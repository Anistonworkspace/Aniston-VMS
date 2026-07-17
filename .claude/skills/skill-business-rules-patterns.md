# Skill: Business Rules Patterns

## Specification pattern

A Specification is a single-purpose, combinable predicate that encodes one business rule.
Name every spec after the rule it checks.

```typescript
// shared/src/domain/specification.ts
export interface Specification<T> {
  isSatisfiedBy(candidate: T): boolean;
  and(other: Specification<T>): Specification<T>;
  or(other: Specification<T>): Specification<T>;
  not(): Specification<T>;
}

export abstract class CompositeSpecification<T> implements Specification<T> {
  abstract isSatisfiedBy(candidate: T): boolean;

  and(other: Specification<T>): Specification<T> {
    return new AndSpecification(this, other);
  }
  or(other: Specification<T>): Specification<T> {
    return new OrSpecification(this, other);
  }
  not(): Specification<T> {
    return new NotSpecification(this);
  }
}

class AndSpecification<T> extends CompositeSpecification<T> {
  constructor(private left: Specification<T>, private right: Specification<T>) { super(); }
  isSatisfiedBy(candidate: T) { return this.left.isSatisfiedBy(candidate) && this.right.isSatisfiedBy(candidate); }
}
class OrSpecification<T> extends CompositeSpecification<T> {
  constructor(private left: Specification<T>, private right: Specification<T>) { super(); }
  isSatisfiedBy(candidate: T) { return this.left.isSatisfiedBy(candidate) || this.right.isSatisfiedBy(candidate); }
}
class NotSpecification<T> extends CompositeSpecification<T> {
  constructor(private wrapped: Specification<T>) { super(); }
  isSatisfiedBy(candidate: T) { return !this.wrapped.isSatisfiedBy(candidate); }
}
```

```typescript
// backend/src/modules/item/domain/item-specifications.ts
import { CompositeSpecification } from '@boilerplate/shared/domain/specification.js';

interface ItemCandidate {
  ownerId: string;
  startDate: Date;
  endDate: Date;
  quota: number;
  durationDays: number;
  existingApprovedItems: Array<{ startDate: Date; endDate: Date }>;
  cooldownEndDate: Date | null;
}

export class HasSufficientQuotaSpec extends CompositeSpecification<ItemCandidate> {
  isSatisfiedBy(candidate: ItemCandidate): boolean {
    return candidate.quota >= candidate.durationDays;
  }
}

export class IsNotInCooldownSpec extends CompositeSpecification<ItemCandidate> {
  isSatisfiedBy(candidate: ItemCandidate): boolean {
    if (!candidate.cooldownEndDate) return true;
    return new Date() > candidate.cooldownEndDate;
  }
}

export class HasNoOverlappingItemSpec extends CompositeSpecification<ItemCandidate> {
  isSatisfiedBy(candidate: ItemCandidate): boolean {
    return !candidate.existingApprovedItems.some(
      (item) => candidate.startDate < item.endDate && candidate.endDate > item.startDate,
    );
  }
}

export class IsWeekdayRangeSpec extends CompositeSpecification<ItemCandidate> {
  isSatisfiedBy(candidate: ItemCandidate): boolean {
    const day = candidate.startDate.getDay();
    return day !== 0 && day !== 6; // Not Sunday or Saturday
  }
}

// Compose rules
export const canCreateItemSpec = new HasSufficientQuotaSpec()
  .and(new IsNotInCooldownSpec())
  .and(new HasNoOverlappingItemSpec())
  .and(new IsWeekdayRangeSpec());
```

```typescript
// Usage in service
import { canCreateItemSpec } from './domain/item-specifications.js';
import { ConflictError } from '../../middleware/errorHandler.js';

const candidate = await buildItemCandidate(dto, actor);
if (!canCreateItemSpec.isSatisfiedBy(candidate)) {
  // Optionally identify WHICH spec failed for better error messages
  const insufficientQuota = new HasSufficientQuotaSpec();
  const overlapping = new HasNoOverlappingItemSpec();
  if (!insufficientQuota.isSatisfiedBy(candidate)) {
    throw new ConflictError('Insufficient quota');
  }
  if (!overlapping.isSatisfiedBy(candidate)) {
    throw new ConflictError('Item dates overlap with an existing approved item');
  }
  throw new ConflictError('Item does not meet policy requirements');
}
```

---

## Policy object pattern

When a decision involves multiple rules and returns a result (not just true/false), use a Policy object.

```typescript
// backend/src/modules/invoice/domain/discount-policy.ts

interface DiscountInput {
  quantity: number;
  tier: 'STANDARD' | 'PREMIUM' | 'EXTERNAL';
  amount: number;
  isPromotion: boolean;
}

interface DiscountDecision {
  eligible: boolean;
  multiplier: number;
  reason: string;
}

export class DiscountPolicy {
  static evaluate(input: DiscountInput): DiscountDecision {
    if (input.tier === 'EXTERNAL') {
      return { eligible: false, multiplier: 0, reason: 'External accounts are not eligible for discounts' };
    }
    if (input.quantity <= 8) {
      return { eligible: false, multiplier: 0, reason: 'No discount — minimum quantity not exceeded' };
    }
    const multiplier = input.isPromotion ? 2.0 : input.tier === 'PREMIUM' ? 1.25 : 1.5;
    return {
      eligible: true,
      multiplier,
      reason: `${input.isPromotion ? 'Promotion' : 'Standard'} discount at ${multiplier}x`,
    };
  }
}
```

---

## Rule table pattern

For complex multi-condition decisions, encode rules in a table rather than nested if/else.

```typescript
// backend/src/modules/item/domain/approval-rules.ts

interface ItemApprovalContext {
  amount: number;
  category: 'STANDARD' | 'RESTRICTED' | 'BULK' | 'OTHER';
  requesterLevel: 'JUNIOR' | 'SENIOR' | 'LEAD' | 'ADMIN';
}

interface ApprovalRequirement {
  requiresReviewerApproval: boolean;
  requiresAdminApproval: boolean;
  requiresSuperAdminApproval: boolean;
}

// Rule table: avoids nested conditionals
const APPROVAL_RULES: Array<{
  condition: (ctx: ItemApprovalContext) => boolean;
  result: ApprovalRequirement;
}> = [
  {
    condition: (ctx) => ctx.amount <= 1000,
    result: { requiresReviewerApproval: false, requiresAdminApproval: false, requiresSuperAdminApproval: false },
  },
  {
    condition: (ctx) => ctx.amount <= 10000 && ctx.category !== 'RESTRICTED',
    result: { requiresReviewerApproval: true, requiresAdminApproval: false, requiresSuperAdminApproval: false },
  },
  {
    condition: (ctx) => ctx.amount <= 50000,
    result: { requiresReviewerApproval: true, requiresAdminApproval: true, requiresSuperAdminApproval: false },
  },
  {
    condition: () => true, // default
    result: { requiresReviewerApproval: true, requiresAdminApproval: true, requiresSuperAdminApproval: true },
  },
];

export function getApprovalRequirements(ctx: ItemApprovalContext): ApprovalRequirement {
  const rule = APPROVAL_RULES.find((r) => r.condition(ctx));
  return rule!.result; // default always matches
}
```

---

## Domain service pattern

When a business rule spans multiple aggregates, put it in a Domain Service — not in either aggregate.

```typescript
// backend/src/modules/item/domain/quota-balance.domain-service.ts
import { prisma } from '../../../lib/prisma.js';

export class QuotaBalanceDomainService {
  // Spans Item and QuotaBalance aggregates — belongs in a domain service
  static async deductQuotaBalance(
    ownerId: string,
    organizationId: string,
    days: number,
    tx: typeof prisma,
  ): Promise<void> {
    const updated = await tx.quotaBalance.updateMany({
      where: {
        ownerId,
        organizationId,
        balance: { gte: days }, // Optimistic lock: only deduct if sufficient
      },
      data: { balance: { decrement: days } },
    });
    if (updated.count === 0) {
      throw new ConflictError('Insufficient quota or concurrent update conflict');
    }
  }
}
```

---

## Rule composition for validation schemas

Compose rules with Zod for API-boundary validation (different from domain specs — these are input validation).

```typescript
// shared/src/schemas/item.schema.ts
import { z } from 'zod';

export const CreateItemSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  reason: z.string().min(10).max(500),
}).refine(
  (data) => new Date(data.startDate) < new Date(data.endDate),
  { message: 'Start date must be before end date', path: ['endDate'] },
).refine(
  (data) => new Date(data.startDate) >= new Date(),
  { message: 'Cannot create an item with a start date in the past', path: ['startDate'] },
);
```

---

## When to use each pattern

| Pattern | Use when |
|---------|----------|
| Specification | Single combinable predicate — is this candidate valid? |
| Policy | Multi-input → structured result (not just boolean) |
| Rule table | Many conditions → one of N outcomes, avoids deep if/else |
| Domain Service | Business rule spans 2+ aggregates |
| Zod refinement | Input validation at API boundary (before reaching domain) |
