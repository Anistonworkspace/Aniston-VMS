# Skill: Workflow Orchestration Patterns

The health-probe → snapshot → image-analysis → incident → notify pipeline
is Aniston VMS's core workflow, built entirely on BullMQ (`apps/workers`).
Canon: `docs/06-implementation-plan.md`, `docs/02-TRD.md` §3–§4.
Complements `skill-state-machine-patterns.md` (the transitions this
pipeline drives) and `skill-business-rules-patterns.md` (the diagnosis
rules it calls).

---

## Two shapes of workflow: saga vs. process manager

Not every multi-step workflow is the same shape:

- **Saga (orchestrator)** — a single request triggers a short, bounded
  sequence with a clear success/failure outcome and compensations. Use for
  **clip export**.
- **Process manager** — a long-running, event-driven flow with no single
  "request" that started it; it reacts to events over minutes/hours and
  decides what happens next each time. Use for the **health → incident**
  pipeline itself, which runs continuously, forever, for every camera.

Don't force the health pipeline into a saga shape — there's no single
caller waiting for a response, and "compensations" don't make sense for an
ongoing monitoring loop.

---

## Saga pattern (orchestration style): clip export

```typescript
// apps/api/src/modules/streaming/sagas/clip-export.saga.ts
// Orchestrator drives every step and knows the full sequence + compensations.
@Injectable()
export class ClipExportSaga {
  constructor(
    @InjectQueue('clip-export') private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
  ) {}

  async start(cameraId: string, start: Date, end: Date, requestedById: string) {
    const clip = await this.prisma.clipExport.create({
      data: { cameraId, start, end, requestedById, status: 'QUEUED' },
    });
    await this.queue.add('render', { clipExportId: clip.id }, { jobId: `clip:${clip.id}` });
    return clip;
  }
}
```

```typescript
// apps/workers/src/processors/clip-export.processor.ts
@Processor('clip-export')
export class ClipExportProcessor extends WorkerHost {
  async process(job: Job<{ clipExportId: string }>) {
    const clip = await this.prisma.clipExport.findUniqueOrThrow({ where: { id: job.data.clipExportId } });
    let s3Key: string | undefined;
    try {
      const localPath = await this.ffmpeg.render(clip); // step 1: forward action
      s3Key = await this.storage.upload(localPath);      // step 2: forward action
      await this.prisma.clipExport.update({ where: { id: clip.id }, data: { status: 'DONE', s3Key } }); // step 3
      await this.notifications.add('clip.ready', { clipExportId: clip.id });
    } catch (err) {
      if (s3Key) await this.storage.delete(s3Key); // compensation: undo step 2 if step 3 failed
      await this.prisma.clipExport.update({ where: { id: clip.id }, data: { status: 'FAILED' } });
      await this.notifications.add('clip.failed', { clipExportId: clip.id });
      throw err; // let BullMQ's retry/backoff policy decide whether to retry
    }
  }
}
```

| Step | Forward action | Compensation on later failure |
|---|---|---|
| 1. Render | ffmpeg cuts the segment from the camera's SD/recording source | delete local temp file (best-effort, no persisted state yet) |
| 2. Upload | push rendered clip to S3/MinIO | delete the uploaded object |
| 3. Persist | mark `clipExport.status = DONE` with `s3Key` | mark `FAILED` instead, notify requester |

---

## Process manager pattern: health → incident pipeline

```typescript
// apps/api/src/modules/incidents/health-pipeline.process-manager.ts
// Reacts to events over time; no single request "owns" this flow.
@Injectable()
export class HealthPipelineProcessManager {
  @OnEvent('HealthCheckCompleted')
  async onHealthCheckCompleted(event: HealthCheckCompletedEvent) {
    if (event.passed) return; // healthy — nothing to do this cycle
    // Borderline result: queue a snapshot so image-analysis has a frame to grade.
    await this.snapshotQueue.add('capture', { cameraId: event.cameraId }, { jobId: `snapshot:${event.cameraId}:${event.windowStart}` });
  }

  @OnEvent('SnapshotCaptured')
  async onSnapshotCaptured(event: SnapshotCapturedEvent) {
    await this.imageAnalysisQueue.add('analyze', { snapshotId: event.snapshotId });
  }

  @OnEvent('ImageAnalysisCompleted')
  async onImageAnalysisCompleted(event: ImageAnalysisCompletedEvent) {
    const candidate = this.toIncidentCandidate(event); // shape from skill-ddd-bounded-contexts-patterns.md's ACL
    if (this.shouldRaiseIncident.isSatisfiedBy(candidate)) { // skill-business-rules-patterns.md
      await this.incidents.createIncidentForHealthBreach(candidate);
    }
  }

  @OnEvent('IncidentAcknowledged')
  async onIncidentAcknowledged(event: IncidentAcknowledgedEvent) {
    await this.escalationQueue.removeRepeatableByKey(`incident:${event.incidentId}:escalate`);
  }

  @OnEvent('IncidentResolved')
  async onIncidentResolved(event: IncidentResolvedEvent) {
    // No new queue entry needed — the next scheduled HealthCheckCompleted
    // for this camera will call incident.recordPostResolutionCheck() (skill-state-machine-patterns.md).
  }
}
```

---

## Queue definitions

```typescript
// apps/workers/src/queues.ts
export const QUEUES = {
  HEALTH_PROBE: 'health-probe',     // repeatable, jittered, one job per camera per cycle
  SNAPSHOT: 'snapshot',             // on-demand, triggered by a failing/borderline probe
  IMAGE_ANALYSIS: 'image-analysis', // calls services/image-analysis (FastAPI/OpenCV)
  INCIDENTS: 'incident-lifecycle',  // internal transitions, low volume
  ESCALATION: 'escalation',         // one repeatable job per open incident, cancelled on ACKNOWLEDGED
  NOTIFICATIONS: 'notifications',   // WhatsApp/email dispatch
  CLIP_EXPORT: 'clip-export',       // saga above
  RETENTION: 'retention',           // nightly snapshot/recording lifecycle purge
} as const;
```

```typescript
// apps/workers/src/queues/health-probe.queue.ts
// ~125 cameras probed within a 5-minute cycle ⇒ ≈ 25/min, spread with jitter
// so probes don't burst and overwhelm routers/RTSP endpoints at once.
await healthProbeQueue.add(
  'probe',
  { cameraId },
  {
    repeat: { every: 5 * 60_000 },
    jobId: `camera:${cameraId}:probe`, // one in-flight prober per camera — see idempotency below
    delay: jitterMs(cameraId, 5 * 60_000), // deterministic per-camera offset, not random each run
  },
);
```

---

## Idempotency

Two different problems, two different mechanisms — don't reach for a
generic "idempotency middleware" for both:

1. **Our own repeatable jobs** — BullMQ's `jobId` *is* the idempotency key.
   `camera:${cameraId}:${checkType}:${windowStart}` guarantees only one
   prober per camera per check-type per window is ever in flight; a
   duplicate `add()` with the same `jobId` is a no-op.

   ```typescript
   await queue.add('probe', payload, { jobId: `camera:${cameraId}:ROUTER_TCP:${windowStart}` });
   ```

2. **Inbound webhooks from third parties** (WhatsApp delivery-status
   callbacks, email bounce webhooks) — these can and do arrive more than
   once. Guard with a unique constraint + a processed check, not a queue
   `jobId`:

   ```typescript
   // apps/api/src/modules/incidents/notifications.controller.ts
   @Post('webhooks/whatsapp/status')
   async whatsappStatus(@Body() dto: WhatsAppStatusDto) {
     const already = await this.prisma.notification.findFirst({
       where: { providerMessageId: dto.messageId, status: dto.status },
     });
     if (already) return { ok: true }; // duplicate delivery, no-op
     await this.notifications.updateStatus(dto.messageId, dto.status);
     return { ok: true };
   }
   ```

---

## Outbox-style consistency: write, commit, then enqueue

There is no separate "outbox table" in Aniston VMS — `IncidentEvent` rows
already serve as the durable, queryable record of what happened, and the
rule from `skill-mvc-patterns.md` (write inside `$transaction`, enqueue
*after* commit) gives the same at-least-once guarantee an outbox table
would, without a separate polling worker:

```typescript
// ✅ CORRECT — DB commit is the source of truth; queue add happens after
await this.prisma.$transaction(async (tx) => {
  await tx.incident.update({ where: { id }, data: { status: 'ALERTED' } });
  await tx.incidentEvent.create({ data: { incidentId: id, type: 'ALERTED' } });
});
await this.notificationsQueue.add('incident.alerted', { incidentId: id }); // after commit
```

If the process crashes between commit and enqueue, the escalation
repeatable job's own next tick (or a periodic reconciliation job scanning
for `ALERTED` incidents with no `Notification` row) catches the gap —
document that reconciliation job wherever this pattern is reused, don't
assume "it'll never happen".

---

## Correlation across the pipeline

Every event and every `AuditLog`/`IncidentEvent` row carries
`entityType: 'Incident'` + `entityId` (the incident's UUID) so a single
`ANI-CAM-2026-000145` can be traced end-to-end — probe → snapshot →
analysis → incident → every escalation step → every notification — across
logs from `apps/api`, `apps/workers`, and `services/image-analysis`.
