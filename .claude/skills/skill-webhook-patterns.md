# Skill — Webhook Patterns (NestJS)

Use this skill for any HTTP callback crossing the Aniston VMS boundary in either direction: **inbound** device/edge callbacks (ONVIF cameras, site routers, MediaMTX stream events) that NestJS receives in `apps/api`, and **outbound** callbacks the platform sends to a client's own URL when an incident changes. Both directions are HMAC-signed, and both must be safe to receive twice.

> Canon: `docs/02-TRD.md` §7 (integration boundary) and `docs/03-app-flow.md` (incident lifecycle) define *what* fires; `docs/05-backend-schema.md` + `prisma/schema.prisma` hold the models; `memory/alignment-dictionary.md` + `CLAUDE.md` fix the module/path names (`apps/api`, `apps/workers`, `services/media` MediaMTX, `packages/shared`). Skim, don't re-derive. This skill only covers the webhook wiring/patterns.

---

## Architecture overview

```
INBOUND   device / router / MediaMTX ──POST──▶ NestJS controller (apps/api)
                                                  │ HMAC verify (raw body)
                                                  │ dedupe on unique constraint
                                                  ▼ react → camera health / incident

OUTBOUND  incident lifecycle event ──▶ dispatch ──▶ BullMQ 'webhooks' queue (apps/workers)
                                                       │ sign per-subscription secret
                                                       │ POST with retry/backoff
                                                       ▼ WebhookDelivery status row
```

Two rules apply to both directions:
1. **Verify before you trust** — an inbound request is authenticated by HMAC over its *raw* body; an outbound request is signed with the subscription's own secret so the client can do the same.
2. **Idempotency is mandatory** — networks re-deliver. Inbound dedupe uses a unique DB constraint; outbound consumers are told to dedupe on the delivery id header.

---

## Prisma models

```prisma
// prisma/schema.prisma — add to the schema (see docs/05-backend-schema.md)

enum WebhookDirection {
  INBOUND
  OUTBOUND
}

enum WebhookDeliveryStatus {
  PENDING
  DELIVERED
  FAILED
}

// Inbound device/edge callbacks — logged once, then reacted to.
model InboundWebhookEvent {
  id             String   @id @default(uuid())
  organizationId String
  source         String   // 'onvif' | 'router' | 'mediamtx'
  eventType      String   // 'motion' | 'stream-up' | 'stream-down'
  cameraId       String?
  dedupeKey      String   // `${source}:${deviceId}:${eventId}` — see idempotency below
  payload        Json
  receivedAt     DateTime @default(now())

  organization   Organization @relation(fields: [organizationId], references: [id])
  camera         Camera?      @relation(fields: [cameraId], references: [id])

  // The idempotency guard: a re-delivered callback hits this unique index and is dropped.
  @@unique([organizationId, source, dedupeKey], name: "uq_inbound_webhook_dedupe")
  @@index([organizationId])
  @@index([cameraId])
  @@index([receivedAt])
}

// Client-configured outbound subscription for incident lifecycle callbacks.
model WebhookSubscription {
  id              String   @id @default(uuid())
  organizationId  String
  url             String
  secretEncrypted String   // per-subscription signing secret, AES-256-GCM at rest (ENCRYPTION_KEY)
  events          String[] // ['incident:created','incident:escalated','incident:resolved']
  isActive        Boolean  @default(true)
  createdById     String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  organization    Organization      @relation(fields: [organizationId], references: [id])
  deliveries      WebhookDelivery[]

  @@index([organizationId])
  @@index([organizationId, isActive])
}

// Per-attempt delivery-status tracking for outbound sends.
model WebhookDelivery {
  id             String   @id @default(uuid())
  organizationId String
  subscriptionId String
  event          String
  url            String
  status         WebhookDeliveryStatus @default(PENDING)
  attemptCount   Int      @default(0)
  statusCode     Int?
  errorMessage   String?
  requestBody    Json
  responseBody   Json?
  deliveredAt    DateTime?
  createdAt      DateTime @default(now())

  organization   Organization        @relation(fields: [organizationId], references: [id])
  subscription   WebhookSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@index([subscriptionId])
  @@index([status, createdAt]) // for retry sweeps and admin surfacing
}
```

---

## INBOUND — raw body must survive parsing

HMAC verification needs the **exact bytes** the device sent; once the JSON body is parsed and re-serialized the signature won't match. Enable Nest's raw-body capture at bootstrap so the guard can read `req.rawBody`.

```typescript
// apps/api/src/main.ts
const app = await NestFactory.create(AppModule, { rawBody: true });
```

---

## INBOUND — HMAC signature guard

The guard runs before the controller, verifies the signature over the raw body with a constant-time compare, and rejects anything that doesn't match. The per-source secret is resolved from config/registration, never from the request body.

```typescript
// apps/api/src/modules/webhooks/guards/webhook-signature.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { InboundWebhookSecrets } from '../inbound-webhook-secrets.service';

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(private readonly secrets: InboundWebhookSecrets) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const raw: Buffer | undefined = req.rawBody;                       // requires rawBody: true
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const source = req.params.source as string;                       // 'onvif' | 'router' | 'mediamtx'

    if (!raw || !signature) throw new UnauthorizedException('Missing webhook signature');

    const secret = await this.secrets.forSource(source);
    const expected = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    // timingSafeEqual throws on length mismatch — length-check first, then constant-time compare.
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    return true;
  }
}
```

---

## INBOUND — controller + class-validator DTO

```typescript
// apps/api/src/modules/webhooks/dto/inbound-webhook.dto.ts
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

export enum InboundWebhookType {
  MOTION      = 'motion',
  STREAM_UP   = 'stream-up',
  STREAM_DOWN = 'stream-down',
}

export class InboundWebhookDto {
  @IsEnum(InboundWebhookType) event!: InboundWebhookType;
  @IsString() deviceId!: string;   // maps to Camera.deviceId → resolves org + zone
  @IsString() eventId!: string;    // device-supplied id, used for the dedupe key
  @IsISO8601() occurredAt!: string;
  @IsOptional() @IsString() streamPath?: string;
}
```

```typescript
// apps/api/src/modules/webhooks/inbound-webhooks.controller.ts
import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { WebhookSignatureGuard } from './guards/webhook-signature.guard';
import { InboundWebhooksService } from './inbound-webhooks.service';
import { InboundWebhookDto } from './dto/inbound-webhook.dto';

// ONVIF cameras, site routers, and MediaMTX all POST to /webhooks/inbound/:source
@Controller('webhooks/inbound')
@UseGuards(WebhookSignatureGuard) // HMAC verified on the raw body before the handler runs
export class InboundWebhooksController {
  constructor(private readonly inbound: InboundWebhooksService) {}

  @Post(':source')
  @HttpCode(202) // ACK fast; the reaction happens after the dedupe write
  handle(@Param('source') source: string, @Body() dto: InboundWebhookDto) {
    return this.inbound.ingest(source, dto);
  }
}
```

---

## INBOUND — service with unique-constraint dedupe

The write to `InboundWebhookEvent` is the idempotency gate: if the same device event arrives twice, the second `create` violates `uq_inbound_webhook_dedupe` (Prisma `P2002`) and we swallow it **before** any camera-health or incident side effect runs.

```typescript
// apps/api/src/modules/webhooks/inbound-webhooks.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CameraHealthService } from '../cameras/camera-health.service';
import { SOCKET_EVENTS } from '@aniston-vms/shared';
import { InboundWebhookDto, InboundWebhookType } from './dto/inbound-webhook.dto';

@Injectable()
export class InboundWebhooksService {
  private readonly logger = new Logger(InboundWebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly cameraHealth: CameraHealthService,
  ) {}

  async ingest(source: string, dto: InboundWebhookDto) {
    const camera = await this.prisma.camera.findFirstOrThrow({
      where: { deviceId: dto.deviceId },
      select: { id: true, organizationId: true, zoneId: true, name: true },
    });

    const dedupeKey = `${source}:${dto.deviceId}:${dto.eventId}`;

    // Idempotency: the unique index makes a re-delivered callback a no-op.
    try {
      await this.prisma.inboundWebhookEvent.create({
        data: {
          organizationId: camera.organizationId,
          source,
          eventType: dto.event,
          cameraId: camera.id,
          dedupeKey,
          payload: dto as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.log(`Duplicate inbound webhook ignored ${dedupeKey}`);
        return { deduped: true }; // already processed — do NOT re-fire side effects
      }
      throw err;
    }

    // First time we've seen it → react.
    switch (dto.event) {
      case InboundWebhookType.STREAM_DOWN:
        await this.cameraHealth.markUnreachable(camera.id, 'MEDIAMTX_STREAM_DOWN');
        break;
      case InboundWebhookType.STREAM_UP:
        await this.cameraHealth.markReachable(camera.id);
        break;
      case InboundWebhookType.MOTION:
        this.realtime.emitToScope(`zone:${camera.zoneId}`, SOCKET_EVENTS.CAMERA_STATUS_CHANGED, {
          cameraId: camera.id,
          event: 'motion',
        });
        break;
    }

    return { deduped: false };
  }
}
```

`CameraHealthService.markUnreachable/markReachable` and the `SOCKET_EVENTS.CAMERA_STATUS_CHANGED` emit are the same primitives `skill-socket-patterns.md` uses — the webhook is just another producer of camera state changes.

---

## OUTBOUND — subscription CRUD (scope + RBAC guarded)

Managing outbound subscriptions is an org-scoped admin action, so the controller is behind `JwtAuthGuard` + `ScopeGuard` with a `@RequireScope(...)` permission. The signing secret is generated server-side, encrypted at rest (AES-256-GCM), and the plaintext is returned exactly once at creation.

```typescript
// apps/api/src/modules/webhooks/dto/create-webhook-subscription.dto.ts
import { ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsOptional, IsUrl } from 'class-validator';

export const OUTBOUND_WEBHOOK_EVENTS = [
  'incident:created',
  'incident:escalated',
  'incident:resolved',
] as const;

export class CreateWebhookSubscriptionDto {
  @IsUrl({ require_protocol: true, protocols: ['https'] }) // https only — no plaintext callbacks
  url!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(OUTBOUND_WEBHOOK_EVENTS, { each: true })
  events!: Array<(typeof OUTBOUND_WEBHOOK_EVENTS)[number]>;

  @IsOptional() @IsBoolean() isActive?: boolean;
}
```

```typescript
// apps/api/src/modules/webhooks/webhook-subscriptions.controller.ts
import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ScopeGuard } from '../../auth/scope.guard';
import { RequireScope } from '../../auth/require-scope.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { WebhookSubscriptionsService } from './webhook-subscriptions.service';
import { CreateWebhookSubscriptionDto } from './dto/create-webhook-subscription.dto';
import type { AuthUser } from '@aniston-vms/shared';

@Controller('webhooks/subscriptions')
@UseGuards(JwtAuthGuard, ScopeGuard) // org-scoped: a user only sees their org's subscriptions
export class WebhookSubscriptionsController {
  constructor(private readonly subscriptions: WebhookSubscriptionsService) {}

  @Get()
  @RequireScope('webhooks:read')
  list(@CurrentUser() actor: AuthUser) {
    return this.subscriptions.list(actor);
  }

  @Post()
  @RequireScope('webhooks:write')
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateWebhookSubscriptionDto) {
    // Returns the plaintext signing secret ONCE; only the AES-256-GCM ciphertext is stored.
    return this.subscriptions.create(actor, dto);
  }

  @Delete(':id')
  @RequireScope('webhooks:write')
  remove(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.subscriptions.deactivate(actor, id); // soft-disable, keeps delivery history
  }
}
```

---

## OUTBOUND — dispatch on incident lifecycle

The incident service, **after** it commits and writes its audit row (see `skill-socket-patterns.md`), also asks the dispatcher to fan the event out to subscribers. The dispatcher creates one `WebhookDelivery` row + one BullMQ job per active subscription — it does not make any HTTP call itself.

```typescript
// apps/api/src/modules/webhooks/outbound-webhooks.service.ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhookDeliveryStatus, Prisma } from '@prisma/client';
import { QUEUE_WEBHOOKS } from '@aniston-vms/shared';

@Injectable()
export class OutboundWebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_WEBHOOKS) private readonly webhooksQueue: Queue,
  ) {}

  // Called from IncidentsService AFTER commit for created | escalated | resolved.
  async dispatch(organizationId: string, event: string, payload: Record<string, unknown>) {
    const subscriptions = await this.prisma.webhookSubscription.findMany({
      where: { organizationId, isActive: true, events: { has: event } },
      select: { id: true, url: true },
    });

    for (const sub of subscriptions) {
      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          organizationId,
          subscriptionId: sub.id,
          event,
          url: sub.url,
          requestBody: payload as Prisma.InputJsonValue,
          status: WebhookDeliveryStatus.PENDING,
        },
      });

      await this.webhooksQueue.add(
        'deliver',
        { deliveryId: delivery.id },
        {
          attempts: 5,
          backoff: { type: 'exponential', delay: 5000 }, // 5s → 10s → 20s → 40s → 80s
          removeOnComplete: true,
        },
      );
    }
  }
}
```

```typescript
// apps/api/src/modules/incidents/incidents.service.ts — hook it into the lifecycle
async escalate(incidentId: string, actor: AuthUser) {
  const updated = await this.prisma.$transaction(/* ... */);
  await this.audit.record(actor, { action: 'incident.escalate', entityType: 'Incident', entityId: incidentId });
  this.realtime.emitToScope(`zone:${updated.zoneId}`, SOCKET_EVENTS.INCIDENT_ESCALATED, { id: updated.id });
  // Outbound fan-out — after commit + audit + socket emit, same ordering rule.
  await this.outbound.dispatch(updated.organizationId, 'incident:escalated', {
    incidentId: updated.id, reference: updated.reference, severity: updated.severity,
  });
  return updated;
}
```

The `incident:created | incident:escalated | incident:resolved` strings match `packages/shared/src/socket-events.ts`, so the socket catalog and the webhook catalog never drift.

---

## OUTBOUND — BullMQ delivery worker (apps/workers)

The worker signs the body with the subscription's own secret, POSTs it, and records the outcome. Transient failures (5xx / timeout) rethrow so BullMQ applies the exponential backoff; client-config failures (4xx) are recorded as `FAILED` and are **not** retried.

```typescript
// apps/workers/src/webhooks/webhooks.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { decrypt } from '../crypto/aes'; // AES-256-GCM, key from ENCRYPTION_KEY
import { WebhookDeliveryStatus } from '@prisma/client';
import { QUEUE_WEBHOOKS } from '@aniston-vms/shared';

@Processor(QUEUE_WEBHOOKS)
export class WebhooksProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<{ deliveryId: string }>) {
    const delivery = await this.prisma.webhookDelivery.findUniqueOrThrow({
      where: { id: job.data.deliveryId },
      include: { subscription: true },
    });

    const body = JSON.stringify(delivery.requestBody);
    const secret = decrypt(delivery.subscription.secretEncrypted); // per-subscription secret
    const signature = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

    try {
      const res = await fetch(delivery.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-aniston-event': delivery.event,
          'x-aniston-delivery': delivery.id, // consumers dedupe on this id
          'x-aniston-timestamp': Date.now().toString(),
          'x-hub-signature-256': signature,
        },
        body,
        signal: AbortSignal.timeout(10_000), // never let a slow endpoint pin a worker
      });

      if (res.status >= 500) throw new Error(`Upstream ${res.status}`); // retryable

      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: res.ok ? WebhookDeliveryStatus.DELIVERED : WebhookDeliveryStatus.FAILED,
          statusCode: res.status,
          attemptCount: job.attemptsMade + 1,
          deliveredAt: res.ok ? new Date() : null,
        },
      });
      // 4xx = the subscriber's config is wrong, not transient → recorded FAILED, no retry.
    } catch (err) {
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: WebhookDeliveryStatus.FAILED,
          errorMessage: (err as Error).message,
          attemptCount: job.attemptsMade + 1,
        },
      });
      throw err; // rethrow so BullMQ applies the backoff / retry policy
    }
  }
}
```

`QUEUE_WEBHOOKS` is registered in the queue-name catalog alongside `QUEUE_HEALTH_PROBE` and `QUEUE_IMAGE_ANALYSIS` (see the background-jobs skill); the worker is bound with `BullModule.registerQueue({ name: QUEUE_WEBHOOKS })` in `apps/workers`.

---

## Checklist before shipping any webhook feature

- [ ] Bootstrap has `{ rawBody: true }` so inbound HMAC verifies the exact bytes received
- [ ] Inbound signature verified in a guard with `timingSafeEqual` (length-checked first) — never `===`
- [ ] Inbound dedupe backed by a `@@unique` constraint; `P2002` is caught and swallowed before side effects
- [ ] Inbound source secret comes from config/registration, never from the request body
- [ ] Outbound URL DTO is `https`-only, validated by class-validator
- [ ] Outbound subscription CRUD behind `JwtAuthGuard` + `ScopeGuard` + `@RequireScope('webhooks:*')`
- [ ] Per-subscription secret generated server-side, stored AES-256-GCM encrypted, plaintext shown once
- [ ] Dispatch runs AFTER commit + audit (same ordering as socket emits) and only enqueues jobs
- [ ] Worker distinguishes 5xx/timeout (retry via rethrow) from 4xx (FAILED, no retry)
- [ ] Every attempt recorded on `WebhookDelivery` (status, statusCode, attemptCount) for admin surfacing
- [ ] Delivery request carries `x-aniston-delivery` id so the consumer can dedupe
- [ ] Event strings match `packages/shared/src/socket-events.ts` — one catalog, no drift

## Anti-patterns

```typescript
// ❌ Verifying HMAC against the re-serialized JSON body — signature will never match
const body = JSON.stringify(req.body);
const expected = createHmac('sha256', secret).update(body).digest('hex'); // WRONG — use req.rawBody

// ❌ Plain string compare on the signature — leaks timing information
if (signature === expected) return true; // WRONG — use timingSafeEqual

// ❌ Reacting to an inbound event before the dedupe write — re-delivery double-fires
await this.cameraHealth.markUnreachable(cameraId, reason);
await this.prisma.inboundWebhookEvent.create({ /* ... */ }); // WRONG order — dedupe first

// ❌ Sending an outbound webhook inline from the request thread — a slow client blocks the incident write
await fetch(sub.url, { /* ... */ }); // WRONG — enqueue on QUEUE_WEBHOOKS, deliver in apps/workers

// ❌ Retrying a 4xx forever — the subscriber's config is broken, not transient
if (!res.ok) throw new Error('failed'); // WRONG — only rethrow on 5xx / timeout

// ❌ Storing the outbound signing secret in plaintext
data: { secret: rawSecret } // WRONG — encrypt AES-256-GCM (secretEncrypted), return plaintext once
```
