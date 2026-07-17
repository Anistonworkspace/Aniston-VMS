# Skill: Workflow Orchestration Patterns

## Saga pattern (orchestration style)

Use when a workflow spans multiple services/modules and needs compensation on failure.
The **Orchestrator** drives every step and knows the full sequence.

```typescript
// backend/src/modules/item/sagas/item-provisioning.saga.ts
import { prisma } from '../../../lib/prisma.js';
import { emailQueue, notificationQueue } from '../../../jobs/queues.js';
import { auditLogger } from '../../../utils/auditLogger.js';
import { ConflictError } from '../../../middleware/errorHandler.js';
import type { AuthUser } from '@boilerplate/shared';

interface ProvisioningInput {
  itemId: string;
  categoryId: string;
  ownerId: string;
  startDate: Date;
}

// Saga step result — explicit success/failure at each step
interface SagaStepResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export class ItemProvisioningSaga {
  private completedSteps: string[] = [];

  async execute(input: ProvisioningInput, actor: AuthUser): Promise<void> {
    try {
      // Step 1: Assign to category
      await this.assignToCategory(input, actor);

      // Step 2: Create user account
      const userId = await this.createUserAccount(input, actor);

      // Step 3: Set up quota
      await this.initializeQuota(input.itemId, actor);

      // Step 4: Send welcome email
      await this.sendWelcomeEmail(input.itemId, userId);

      // Step 5: Notify owner
      await this.notifyOwner(input.ownerId, input.itemId, actor.organizationId);

    } catch (err) {
      // Compensate completed steps in reverse order
      await this.compensate(input, actor);
      throw err;
    }
  }

  private async assignToCategory(input: ProvisioningInput, actor: AuthUser): Promise<void> {
    await prisma.item.update({
      where: { id: input.itemId },
      data: { categoryId: input.categoryId, ownerId: input.ownerId },
    });
    this.completedSteps.push('assignToCategory');
  }

  private async createUserAccount(input: ProvisioningInput, actor: AuthUser): Promise<string> {
    const item = await prisma.item.findFirstOrThrow({
      where: { id: input.itemId, organizationId: actor.organizationId },
    });
    const user = await prisma.user.create({
      data: {
        email: item.email,
        name: item.name,
        passwordHash: 'TEMP_RESET_REQUIRED',
        role: 'MEMBER',
        organizationId: actor.organizationId,
        itemId: input.itemId,
      },
    });
    this.completedSteps.push('createUserAccount');
    return user.id;
  }

  private async initializeQuota(itemId: string, actor: AuthUser): Promise<void> {
    await prisma.quota.create({
      data: {
        itemId,
        organizationId: actor.organizationId,
        dailyQuota: 12,
        monthlyQuota: 12,
        usedQuota: 0,
      },
    });
    this.completedSteps.push('initializeQuota');
  }

  private async sendWelcomeEmail(itemId: string, userId: string): Promise<void> {
    await emailQueue.add('welcome-item', { itemId, userId });
    this.completedSteps.push('sendWelcomeEmail');
  }

  private async notifyOwner(ownerId: string, itemId: string, organizationId: string): Promise<void> {
    await notificationQueue.add('new-item', { ownerId, itemId, organizationId });
    this.completedSteps.push('notifyOwner');
  }

  private async compensate(input: ProvisioningInput, actor: AuthUser): Promise<void> {
    // Reverse completed steps
    for (const step of [...this.completedSteps].reverse()) {
      try {
        switch (step) {
          case 'createUserAccount':
            await prisma.user.deleteMany({ where: { itemId: input.itemId, organizationId: actor.organizationId } });
            break;
          case 'initializeQuota':
            await prisma.quota.deleteMany({ where: { itemId: input.itemId, organizationId: actor.organizationId } });
            break;
          // Email/notifications don't need compensation
        }
      } catch {
        // Log compensation failures but continue — partial compensation is better than none
        console.error(`Compensation failed for step: ${step}`);
      }
    }
  }
}
```

---

## Outbox pattern (reliable event publishing)

Guarantees events are published even if the process crashes after the DB write.

```typescript
// prisma/schema.prisma — add OutboxEvent model
// model OutboxEvent {
//   id            String    @id @default(uuid())
//   organizationId String
//   aggregateId   String
//   aggregateType String
//   eventType     String
//   payload       Json
//   processedAt   DateTime?
//   createdAt     DateTime  @default(now())
//   @@index([processedAt, createdAt])
//   @@index([organizationId])
// }

// backend/src/lib/outbox.ts
import { prisma } from './prisma.js';

export const outbox = {
  async store(
    tx: typeof prisma,
    event: { organizationId: string; aggregateId: string; aggregateType: string; eventType: string; payload: object },
  ) {
    await tx.outboxEvent.create({ data: event });
  },
};

// Write + outbox in same transaction = atomic
await prisma.$transaction(async (tx) => {
  const item = await tx.item.update({
    where: { id, organizationId: actor.organizationId },
    data: { status: 'APPROVED' },
  });
  await outbox.store(tx, {
    organizationId: actor.organizationId,
    aggregateId: id,
    aggregateType: 'Item',
    eventType: 'ITEM_APPROVED',
    payload: { approverId: actor.id },
  });
  return item;
});
```

```typescript
// backend/src/jobs/workers/outbox.worker.ts — polls and dispatches events
import { Worker } from 'bullmq';
import { redis } from '../../lib/redis.js';
import { prisma } from '../../lib/prisma.js';
import { io } from '../../socket.js';

// BullMQ job polls outbox every 5 seconds
export const outboxWorker = new Worker(
  'outbox',
  async () => {
    const unprocessed = await prisma.outboxEvent.findMany({
      where: { processedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    for (const event of unprocessed) {
      try {
        // Dispatch to socket
        io.to(`org:${event.organizationId}`).emit(`event:${event.eventType}`, event.payload);

        // Mark processed
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: { processedAt: new Date() },
        });
      } catch (err) {
        // Don't mark processed — will retry next poll
      }
    }
  },
  { connection: redis, concurrency: 1 },
);
```

---

## Process Manager pattern

For long-running workflows that wait on external events (approvals, payments, integrations).

```typescript
// backend/src/modules/item/domain/item-approval.process-manager.ts
import { prisma } from '../../../lib/prisma.js';

type ProcessState = 'AWAITING_L1' | 'AWAITING_L2' | 'AWAITING_L3' | 'APPROVED' | 'REJECTED';

export class ItemApprovalProcessManager {
  static async handleEvent(event: { type: string; itemId: string; organizationId: string; actorId: string }) {
    const item = await prisma.item.findFirstOrThrow({
      where: { id: event.itemId, organizationId: event.organizationId },
    });

    const transitions: Record<string, Record<string, ProcessState>> = {
      AWAITING_L1: { L1_APPROVED: 'AWAITING_L2', REJECTED: 'REJECTED' },
      AWAITING_L2: { L2_APPROVED: 'AWAITING_L3', REJECTED: 'REJECTED' },
      AWAITING_L3: { L3_APPROVED: 'APPROVED', REJECTED: 'REJECTED' },
    };

    const nextState = transitions[item.approvalState]?.[event.type];
    if (!nextState) return; // Unknown transition — ignore

    await prisma.item.update({
      where: { id: event.itemId },
      data: { approvalState: nextState },
    });

    // Trigger side effects based on new state
    if (nextState === 'APPROVED') {
      await prisma.payment.create({
        data: { itemId: event.itemId, amount: item.amount, organizationId: event.organizationId, status: 'PENDING' },
      });
    }
  }
}
```

---

## Choreography (event-driven, no central orchestrator)

Use when modules should react independently without knowing about each other.

```typescript
// Module A publishes an event
// backend/src/modules/item/item.service.ts — after approval:
io.to(`org:${organizationId}`).emit('domain:ItemApproved', {
  itemId,
  startDate,
  endDate,
  durationDays,
});

// Module B (Schedule) reacts independently
// backend/src/modules/schedule/schedule.event-listener.ts
import { io } from '../../socket.js';
io.on('domain:ItemApproved', async (data) => {
  await prisma.scheduleEntry.createMany({
    data: buildDateRange(data.startDate, data.endDate).map((date) => ({
      itemId: data.itemId,
      date,
      type: 'APPROVED_ITEM',
    })),
  });
});
```

---

## Idempotency key pattern

Prevents duplicate processing when retries or double-submits occur.

```typescript
// backend/src/middleware/idempotency.ts
import { redis } from '../lib/redis.js';
import type { Request, Response, NextFunction } from 'express';

export function idempotencyMiddleware(ttlSeconds = 86400) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.headers['idempotency-key'] as string;
    if (!key) return next();

    const cacheKey = `idem:${req.user?.organizationId}:${key}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      res.status(200).json(JSON.parse(cached));
      return;
    }

    // Intercept the response to cache it
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      redis.setex(cacheKey, ttlSeconds, JSON.stringify(body)).catch(() => {});
      return originalJson(body);
    };

    next();
  };
}

// Apply to mutation routes:
// router.post('/payments', authenticate, requirePermission('payments', 'create'), idempotencyMiddleware(), PaymentController.create);
// Frontend sends: headers: { 'Idempotency-Key': crypto.randomUUID() }
```

---

## Durable execution checklist

| Concern | Pattern |
|---------|---------|
| Event lost if process crashes | Outbox pattern |
| Double-processing a message | Idempotency key |
| Partial saga failure | Compensation steps in reverse order |
| Long-running approval workflows | Process Manager |
| Module coupling | Choreography (events) over Orchestration (direct calls) |
| Concurrent state transitions | Prisma updateMany with current state in WHERE |
