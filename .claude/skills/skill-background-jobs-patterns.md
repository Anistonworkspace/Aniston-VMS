# Skill — Background Jobs Patterns (BullMQ)

Use queues for anything that should NOT block an API response: RTSP/ONVIF/router health probes, snapshot
capture, OpenCV image-analysis calls, and WhatsApp/Email/in-app escalation notifications.

See `docs/02-TRD.md` (monitoring cadence + escalation rules), `docs/05-backend-schema.md` (HealthCheck /
Incident / Escalation / Notification / Snapshot models) and `docs/03-app-flow.md` (the canonical pipeline
diagram) before changing queue shapes.

---

## Architecture

```
apps/api (NestJS)              apps/workers (BullMQ)                  Frontend
Service → Queue.add(job) → BullMQ → Processor runs async → Prisma write / Socket emit
     ↑                                                                       ↓
API responds                                                       LiveWallGrid / IncidentKanban
 immediately                                                        update in real-time
```

The core pipeline this skill exists to support (see `docs/03-app-flow.md`):

```
health-probe → snapshot capture → image-analysis → open Incident (ANI-CAM-2026-000145)
            → Escalation timeline → Notifications (WhatsApp/Email/in-app)
```

---

## Queue definitions (registered once, shared by `apps/api` producers and `apps/workers` consumers)

```typescript
// packages/shared/src/queues/queue-names.ts
export const QUEUE_HEALTH_PROBE    = 'health-probe';
export const QUEUE_SNAPSHOT        = 'snapshot';
export const QUEUE_IMAGE_ANALYSIS  = 'image-analysis';
export const QUEUE_NOTIFY          = 'notify';

export const ALL_QUEUES = [
  QUEUE_HEALTH_PROBE,
  QUEUE_SNAPSHOT,
  QUEUE_IMAGE_ANALYSIS,
  QUEUE_NOTIFY,
] as const;
```

```typescript
// apps/api/src/jobs/queues.module.ts — producer side, registered with Nest's BullMQ integration
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import {
  QUEUE_HEALTH_PROBE,
  QUEUE_SNAPSHOT,
  QUEUE_IMAGE_ANALYSIS,
  QUEUE_NOTIFY,
} from '@aniston-vms/shared/queues/queue-names';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_HEALTH_PROBE },
      { name: QUEUE_SNAPSHOT },
      { name: QUEUE_IMAGE_ANALYSIS },
      { name: QUEUE_NOTIFY },
    ),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
```

`BullModule.forRoot` (in `apps/api/src/app.module.ts` and `apps/workers/src/app.module.ts`) points both
processes at the same Redis via `REDIS_URL` — `apps/api` only ever calls `.add()`, `apps/workers` runs the
`@Processor` classes.

---

## Job type definitions

```typescript
// packages/shared/src/queues/job-types.ts
import type { CheckType, CameraStatus } from '../enums.js';

export type HealthProbeJobData = {
  organizationId: string;
  cameraId: string;         // e.g. CAM-042
  checkType: CheckType;     // RTSP | ONVIF | ROUTER | SIM — see docs/05-backend-schema.md
};

export type SnapshotJobData = {
  organizationId: string;
  cameraId: string;
  streamKind: 'LIVE_MAIN' | 'LIVE_SUB';
  reason: 'SCHEDULED' | 'HEALTH_CHECK' | 'INCIDENT_EVIDENCE';
};

export type ImageAnalysisJobData = {
  organizationId: string;
  cameraId: string;
  snapshotId: string;
  snapshotKey: string;      // MinIO/S3 key — see skill-file-upload-patterns.md for the layout
};

export type NotifyJobData = {
  organizationId: string;
  userId: string;           // recipient (SUPER_ADMIN / PROJECT_ADMIN / CLIENT_VIEWER)
  channel: 'WHATSAPP' | 'EMAIL' | 'IN_APP';
  type: string;             // e.g. 'INCIDENT_OPENED', 'INCIDENT_ESCALATED', 'RECOVERY_VERIFIED'
  title: string;
  body: string;
  entityId?: string;        // usually the Incident id (ANI-CAM-2026-000145)
  entityType?: 'Incident' | 'Camera' | 'MaintenanceTask';
};
```

---

## Adding jobs from a service

```typescript
// apps/api/src/modules/health-check/health-check.service.ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  QUEUE_SNAPSHOT,
  QUEUE_NOTIFY,
} from '@aniston-vms/shared/queues/queue-names';
import type { SnapshotJobData, NotifyJobData } from '@aniston-vms/shared/queues/job-types';

@Injectable()
export class HealthCheckService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_SNAPSHOT) private readonly snapshotQueue: Queue,
    @InjectQueue(QUEUE_NOTIFY) private readonly notifyQueue: Queue,
  ) {}

  // Called by the health-probe processor when a camera flips to CAMERA_OFFLINE
  async openIncidentAndEscalate(cameraId: string, organizationId: string, code: string) {
    const incident = await this.prisma.$transaction(async (tx) => {
      const camera = await tx.camera.update({
        where: { id: cameraId },
        data: { status: 'CAMERA_OFFLINE' },
      });
      return tx.incident.create({
        data: {
          organizationId,
          cameraId,
          code,                     // e.g. 'CAMERA_OFFLINE', 'SITE_INTERNET_DOWN'
          status: 'OPEN',
          reference: await this.nextIncidentReference(organizationId), // ANI-CAM-2026-000145
        },
      });
    });

    // Jobs go OUTSIDE the transaction — they must run even if downstream steps are slow/retried
    await this.snapshotQueue.add(
      'capture-evidence',
      { organizationId, cameraId, streamKind: 'LIVE_MAIN', reason: 'INCIDENT_EVIDENCE' } satisfies SnapshotJobData,
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    await this.notifyQueue.add(
      'incident-opened',
      {
        organizationId,
        userId: await this.escalationOwnerId(cameraId),
        channel: 'WHATSAPP',
        type: 'INCIDENT_OPENED',
        title: `Incident ${incident.reference} opened`,
        body: `Camera ${cameraId} went offline (${code}). Escalation timeline started.`,
        entityId: incident.id,
        entityType: 'Incident',
      } satisfies NotifyJobData,
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { count: 500 },  // ~125 cameras generate steady incident volume
        removeOnFail:     { count: 1000 },
      },
    );

    return incident;
  }

  private async nextIncidentReference(_organizationId: string) { /* ANI-CAM-<year>-<seq> — see docs/05-backend-schema.md */ return 'ANI-CAM-2026-000145'; }
  private async escalationOwnerId(_cameraId: string) { return 'user-id-of-on-call-project-admin'; }
}
```

---

## Health-probe worker (RTSP / ONVIF / router / SIM reachability)

```typescript
// apps/workers/src/processors/health-probe.processor.ts
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUE_HEALTH_PROBE } from '@aniston-vms/shared/queues/queue-names';
import type { HealthProbeJobData } from '@aniston-vms/shared/queues/job-types';
import { HealthCheckService } from '../services/health-check.service.js';
import { probeRtsp, probeOnvif, probeRouter } from '../probes/index.js';

@Processor(QUEUE_HEALTH_PROBE, { concurrency: 20 }) // cheap network probes, ~125 cameras in rotation
export class HealthProbeProcessor extends WorkerHost {
  private readonly logger = new Logger(HealthProbeProcessor.name);

  constructor(private readonly healthCheckService: HealthCheckService) {
    super();
  }

  async process(job: Job<HealthProbeJobData>): Promise<{ status: string; code: string }> {
    const { organizationId, cameraId, checkType } = job.data;
    this.logger.log(`Probing ${cameraId} (${checkType}) — job ${job.id}`);

    const result =
      checkType === 'RTSP'   ? await probeRtsp(cameraId) :
      checkType === 'ONVIF'  ? await probeOnvif(cameraId) :
      await probeRouter(cameraId);
    // result.code ∈ CAMERA_REACHABLE | CAMERA_OFFLINE | CAMERA_TIMEOUT | CAMERA_PORT_CLOSED |
    //               ROUTER_ONLINE | ROUTER_OFFLINE | ROUTER_REBOOTED | SITE_INTERNET_DOWN |
    //               NETWORK_UNSTABLE | SIM_DISCONNECTED | SIM_SIGNAL_ISSUE | RECOVERY_VERIFIED ...
    //               (full catalog in memory/alignment-dictionary.md §2)

    if (result.status === 'FAILING') {
      await this.healthCheckService.openIncidentAndEscalate(cameraId, organizationId, result.code);
    } else if (result.code === 'RECOVERY_VERIFIED') {
      await this.healthCheckService.markRecovered(cameraId, organizationId);
    }

    return result;
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`health-probe job ${job.id} failed after ${job.attemptsMade} attempts: ${err.message}`);
  }
}
```

Repeatable probes are scheduled per camera (not per request) — see the bulk re-check pattern in
`skill-bulk-operations-patterns.md`:

```typescript
await healthProbeQueue.add(
  'probe',
  { organizationId, cameraId, checkType: 'RTSP' } satisfies HealthProbeJobData,
  { repeat: { every: 60_000 }, jobId: `probe:${cameraId}:rtsp` }, // stable jobId de-dupes the repeat
);
```

---

## Snapshot worker (capture → MinIO/S3 → chain to image-analysis)

```typescript
// apps/workers/src/processors/snapshot.processor.ts
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { QUEUE_SNAPSHOT, QUEUE_IMAGE_ANALYSIS } from '@aniston-vms/shared/queues/queue-names';
import type { SnapshotJobData, ImageAnalysisJobData } from '@aniston-vms/shared/queues/job-types';
import { captureFrame } from '../media/mediamtx-client.js';   // pulls a still frame via services/media
import { uploadObject } from '../storage/minio-client.js';    // recording/snapshot key layout — see
                                                                // skill-file-upload-patterns.md
import { PrismaService } from '../prisma/prisma.service.js';

@Processor(QUEUE_SNAPSHOT, { concurrency: 8 })
export class SnapshotProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_IMAGE_ANALYSIS) private readonly imageAnalysisQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<SnapshotJobData>) {
    const { organizationId, cameraId, streamKind } = job.data;
    await job.updateProgress(20);

    const frame = await captureFrame(cameraId, streamKind); // MediaMTX on-demand pull
    await job.updateProgress(60);

    const key = await uploadObject({ organizationId, cameraId, kind: 'snapshot', buffer: frame });
    const snapshot = await this.prisma.snapshot.create({
      data: { organizationId, cameraId, storageKey: key, capturedAt: new Date() },
    });
    await job.updateProgress(90);

    await this.imageAnalysisQueue.add(
      'analyze',
      { organizationId, cameraId, snapshotId: snapshot.id, snapshotKey: key } satisfies ImageAnalysisJobData,
      { attempts: 2 },
    );

    await job.updateProgress(100);
    return { snapshotId: snapshot.id, key };
  }
}
```

---

## Image-analysis worker (calls the `services/image-analysis` FastAPI + OpenCV microservice)

```typescript
// apps/workers/src/processors/image-analysis.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUE_IMAGE_ANALYSIS } from '@aniston-vms/shared/queues/queue-names';
import type { ImageAnalysisJobData } from '@aniston-vms/shared/queues/job-types';
import { HealthCheckService } from '../services/health-check.service.js';
import { imageAnalysisClient } from '../clients/image-analysis.client.js'; // HTTP client → FastAPI

@Processor(QUEUE_IMAGE_ANALYSIS, { concurrency: 3 }) // OpenCV work is CPU-bound on the Python side
export class ImageAnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(ImageAnalysisProcessor.name);

  constructor(private readonly healthCheckService: HealthCheckService) {
    super();
  }

  async process(job: Job<ImageAnalysisJobData>) {
    const { organizationId, cameraId, snapshotId, snapshotKey } = job.data;

    // POST services/image-analysis /analyze { snapshotKey } → { code, confidence }
    const diagnosis = await imageAnalysisClient.analyze({ snapshotKey });
    // diagnosis.code ∈ VIDEO_HEALTHY | IMAGE_PROBLEM | LENS_CLEANING | WRONG_RESOLUTION |
    //                  WRONG_CODEC | LOW_BITRATE | LOW_FPS | STREAM_DEGRADED | UNSTABLE_STREAM | CONFIG_ERROR

    this.logger.log(`snapshot ${snapshotId} (${cameraId}) → ${diagnosis.code} (${diagnosis.confidence})`);

    if (diagnosis.code !== 'VIDEO_HEALTHY') {
      await this.healthCheckService.openIncidentAndEscalate(cameraId, organizationId, diagnosis.code);
    }

    return diagnosis;
  }
}
```

---

## Notify worker (WhatsApp / Email / in-app + Socket push)

```typescript
// apps/workers/src/processors/notify.processor.ts
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NOTIFY } from '@aniston-vms/shared/queues/queue-names';
import type { NotifyJobData } from '@aniston-vms/shared/queues/job-types';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js'; // see skill-socket-patterns.md
import { WhatsappService } from '../notifications/whatsapp.service.js';
import { EmailService } from '../notifications/email.service.js';
import { Logger } from '@nestjs/common';

@Processor(QUEUE_NOTIFY, { concurrency: 10 })
export class NotifyProcessor extends WorkerHost {
  private readonly logger = new Logger(NotifyProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: RealtimeGateway,
    private readonly whatsapp: WhatsappService,
    private readonly email: EmailService,
  ) {
    super();
  }

  async process(job: Job<NotifyJobData>) {
    const { organizationId, userId, channel, type, title, body, entityId, entityType } = job.data;

    const notification = await this.prisma.notification.create({
      data: { organizationId, userId, type, title, body, entityId, entityType, status: 'QUEUED' },
    });

    if (channel === 'WHATSAPP') await this.whatsapp.send(userId, `${title}\n${body}`);
    if (channel === 'EMAIL')    await this.email.send({ to: userId, subject: title, template: 'escalation', context: { body } });

    await this.prisma.notification.update({ where: { id: notification.id }, data: { status: 'SENT' } });

    // Push to the user's room so IncidentKanban / EscalationTimeline update without a refresh
    this.gateway.server.to(`user:${userId}`).emit('notification:new', {
      id: notification.id,
      type,
      title,
      body,
      entityId,
      createdAt: notification.createdAt,
    });
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`notify job ${job.id} failed after ${job.attemptsMade} attempts: ${err.message}`, job.data);
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    this.logger.warn(`notify job ${jobId} stalled — will be retried`);
  }
}
```

---

## Register all processors (`apps/workers` bootstrap)

```typescript
// apps/workers/src/app.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HealthProbeProcessor } from './processors/health-probe.processor.js';
import { SnapshotProcessor } from './processors/snapshot.processor.js';
import { ImageAnalysisProcessor } from './processors/image-analysis.processor.js';
import { NotifyProcessor } from './processors/notify.processor.js';

@Module({
  imports: [
    BullModule.forRoot({ connection: { url: process.env.REDIS_URL } }),
    BullModule.registerQueue(
      { name: 'health-probe' }, { name: 'snapshot' }, { name: 'image-analysis' }, { name: 'notify' },
    ),
  ],
  providers: [HealthProbeProcessor, SnapshotProcessor, ImageAnalysisProcessor, NotifyProcessor],
})
export class AppModule {}
```

```typescript
// apps/workers/src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // Workers don't listen on HTTP — this process only drains queues
  await NestFactory.createApplicationContext(AppModule);
}
bootstrap();
```

---

## Job status API endpoint

```typescript
// apps/api/src/jobs/jobs.controller.ts
@Controller('jobs')
export class JobsController {
  constructor(@InjectQueue('image-analysis') private readonly imageAnalysisQueue: Queue) {}

  @Get(':jobId/status')
  async getStatus(@Param('jobId') jobId: string) {
    const job = await this.imageAnalysisQueue.getJob(jobId);
    if (!job) throw new NotFoundException('Job not found');
    return { success: true, data: { id: job.id, state: await job.getState(), progress: job.progress, result: job.returnvalue } };
  }
}
```

---

## Checklist

- [ ] Queue `.add()` calls are OUTSIDE and AFTER `prisma.$transaction` — not inside it
- [ ] Job payload types live in `packages/shared/src/queues/job-types.ts` and use `satisfies` for type safety
- [ ] Repeatable health-probes use a stable `jobId` (`probe:${cameraId}:${checkType}`) so BullMQ de-dupes them
- [ ] Retry options set per queue: `attempts`, `backoff: exponential`
- [ ] `removeOnComplete` / `removeOnFail` set — prevents Redis memory bloat across ~125 cameras
- [ ] Processors handle `failed` and `stalled` via `@OnWorkerEvent` with structured `Logger` output
- [ ] Long-running jobs (`snapshot`, `image-analysis`) report progress via `job.updateProgress`
- [ ] All `@Processor` classes registered as providers in `apps/workers/src/app.module.ts`
- [ ] Concurrency tuned per queue (`health-probe`: 20, `snapshot`: 8, `image-analysis`: 3, `notify`: 10)
- [ ] `notify` jobs always persist a `Notification` row before pushing the socket event
- [ ] Never `await` a blocking network/CPU call inside the code path that adds a job — queue it and return