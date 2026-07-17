# Skill — Background Jobs Patterns (BullMQ)

Use queues for anything that should NOT block an API response: emails, notifications, PDF generation, CSV import, third-party API calls.

---

## Architecture

```
Service layer → Queue.add(job) → BullMQ → Worker processes async → Socket emit / DB update
     ↑                                                                       ↓
API responds                                                       Frontend updates in real-time
 immediately
```

---

## Queue definitions (already in boilerplate)

```typescript
// backend/src/jobs/queues.ts
import { Queue } from 'bullmq';
import { redisClient } from '../lib/redis.js';

const connection = redisClient;  // shared Redis connection

export const emailQueue        = new Queue('email',        { connection });
export const notificationQueue = new Queue('notification', { connection });
export const exportQueue       = new Queue('export',       { connection });
export const importQueue       = new Queue('import',       { connection });

// All queues — register here so the health check can list them
export const ALL_QUEUES = [emailQueue, notificationQueue, exportQueue, importQueue];
```

---

## Job type definitions

```typescript
// backend/src/jobs/job-types.ts
export type EmailJobData = {
  to: string;
  subject: string;
  template: 'welcome' | 'item-approved' | 'item-rejected' | 'password-reset';
  context: Record<string, string | number>;
};

export type NotificationJobData = {
  organizationId: string;
  userId: string;         // recipient
  type: string;           // e.g. 'ITEM_APPROVED'
  title: string;
  body: string;
  entityId?: string;      // the record it relates to
  entityType?: string;
};

export type ExportJobData = {
  organizationId: string;
  requestedBy: string;   // userId
  module: string;        // 'items' | 'categories'
  filters: Record<string, unknown>;
};

export type ImportJobData = {
  organizationId: string;
  uploadedBy: string;
  filePath: string;       // local path or S3 key
  module: string;
};
```

---

## Adding jobs from a service

```typescript
// In any service — add to queue AFTER the transaction commits
import { emailQueue, notificationQueue } from '../../jobs/queues.js';
import type { EmailJobData, NotificationJobData } from '../../jobs/job-types.js';

export class ItemService {
  static async approve(id: string, actor: AuthUser) {
    const updated = await prisma.$transaction(async (tx) => {
      // ... update logic
    });

    // Add jobs OUTSIDE the transaction (they run regardless of what happens next)
    await emailQueue.add(
      'item-approved',                       // job name (for worker matching)
      {
        to: updated.owner.email,
        subject: 'Your item was approved',
        template: 'item-approved',
        context: { name: updated.owner.firstName, startDate: updated.startDate },
      } satisfies EmailJobData,
      {
        attempts: 3,                         // retry 3 times on failure
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },    // keep last 100 completed jobs
        removeOnFail:     { count: 200 },    // keep last 200 failed jobs
      },
    );

    await notificationQueue.add('item-approved', {
      organizationId: actor.organizationId,
      userId: updated.owner.userId,
      type: 'ITEM_APPROVED',
      title: 'Item approved',
      body: `Your ${updated.type} item from ${updated.startDate} was approved.`,
      entityId: updated.id,
      entityType: 'Item',
    } satisfies NotificationJobData);

    return updated;
  }
}
```

---

## Email worker

```typescript
// backend/src/jobs/workers/email.worker.ts
import { Worker, type Job } from 'bullmq';
import { redisClient } from '../../lib/redis.js';
import { emailService } from '../../services/email.js';
import { logger } from '../../lib/logger.js';
import type { EmailJobData } from '../job-types.js';

export const emailWorker = new Worker(
  'email',
  async (job: Job<EmailJobData>) => {
    logger.info(`[EmailWorker] Processing job ${job.id}: ${job.name}`);

    await emailService.send({
      to:       job.data.to,
      subject:  job.data.subject,
      template: job.data.template,
      context:  job.data.context,
    });

    logger.info(`[EmailWorker] Job ${job.id} completed`);
  },
  {
    connection: redisClient,
    concurrency: 5,   // process up to 5 emails simultaneously
  },
);

emailWorker.on('failed', (job, err) => {
  logger.error(`[EmailWorker] Job ${job?.id} failed after ${job?.attemptsMade} attempts`, {
    error: err.message,
    data: job?.data,
  });
});

emailWorker.on('stalled', (jobId) => {
  logger.warn(`[EmailWorker] Job ${jobId} stalled — will be retried`);
});
```

---

## Notification worker (DB + Socket emit)

```typescript
// backend/src/jobs/workers/notification.worker.ts
import { Worker, type Job } from 'bullmq';
import { redisClient } from '../../lib/redis.js';
import { prisma } from '../../lib/prisma.js';
import { getIO } from '../../lib/socket.js';
import { logger } from '../../lib/logger.js';
import type { NotificationJobData } from '../job-types.js';

export const notificationWorker = new Worker(
  'notification',
  async (job: Job<NotificationJobData>) => {
    const { organizationId, userId, type, title, body, entityId, entityType } = job.data;

    // 1. Persist notification to database
    const notification = await prisma.notification.create({
      data: { organizationId, userId, type, title, body, entityId, entityType },
    });

    // 2. Push to user's socket room in real-time
    getIO().to(`user:${userId}`).emit('notification:new', {
      id:    notification.id,
      type,
      title,
      body,
      createdAt: notification.createdAt,
    });
  },
  { connection: redisClient, concurrency: 10 },
);
```

---

## Export worker (long-running job with progress)

```typescript
// backend/src/jobs/workers/export.worker.ts
import { Worker, type Job } from 'bullmq';
import { redisClient } from '../../lib/redis.js';
import { getIO } from '../../lib/socket.js';
import type { ExportJobData } from '../job-types.js';

export const exportWorker = new Worker(
  'export',
  async (job: Job<ExportJobData>) => {
    const { organizationId, requestedBy, module, filters } = job.data;

    // Report progress so frontend can show a progress bar
    await job.updateProgress(10);

    const data = await fetchAllRecords(module, organizationId, filters);
    await job.updateProgress(50);

    const fileUrl = await generateExcel(data);
    await job.updateProgress(90);

    // Notify the user their export is ready
    getIO().to(`user:${requestedBy}`).emit('export:ready', {
      module,
      fileUrl,
      count: data.length,
    });

    await job.updateProgress(100);
    return { fileUrl, count: data.length };
  },
  { connection: redisClient, concurrency: 2 },  // limit concurrency for heavy jobs
);
```

---

## Register all workers in server startup

```typescript
// backend/src/jobs/index.ts — imported once in server.ts
export { emailWorker }        from './workers/email.worker.js';
export { notificationWorker } from './workers/notification.worker.js';
export { exportWorker }       from './workers/export.worker.js';
export { importWorker }       from './workers/import.worker.js';
```

```typescript
// backend/src/server.ts
import './jobs/index.js';  // start all workers
```

---

## Job status API endpoint

```typescript
// Let the frontend poll job status for long-running jobs
GET /api/jobs/:jobId/status

// Response
{ success: true, data: { id: '123', state: 'active', progress: 50, result: null } }
```

---

## Checklist

- [ ] Queue add is OUTSIDE and AFTER `prisma.$transaction` — not inside it
- [ ] Job data type defined in `job-types.ts` and uses `satisfies` for type safety
- [ ] Retry options set: `attempts: 3`, `backoff: exponential`
- [ ] `removeOnComplete` and `removeOnFail` set — prevents Redis memory bloat
- [ ] Workers handle `failed` and `stalled` events with structured logging
- [ ] Long-running workers emit progress updates via socket
- [ ] All workers registered in `jobs/index.ts` and imported once in `server.ts`
- [ ] Concurrency limit set per worker (email: 5, export: 2)
- [ ] Never `await` inside a queue add for blocking operations
