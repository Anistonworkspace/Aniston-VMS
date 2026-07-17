# Skill — Webhook Patterns

Incoming HMAC validation, outgoing webhooks with retry, event catalog, webhook log model.

---

## Webhook log model

```prisma
model WebhookLog {
  id             String    @id @default(uuid())
  organizationId String
  direction      WebhookDirection
  event          String              // e.g. 'item.created'
  url            String?             // outgoing: target URL
  source         String?             // incoming: e.g. 'github', 'stripe'
  statusCode     Int?
  requestBody    Json
  responseBody   Json?
  attemptCount   Int       @default(1)
  success        Boolean   @default(false)
  errorMessage   String?
  processedAt    DateTime?
  createdAt      DateTime  @default(now())

  organization Organization @relation(fields: [organizationId], references: [id])

  @@index([organizationId])
  @@index([event])
  @@index([createdAt])
  @@index([success, createdAt])   // for retry queries
}

enum WebhookDirection {
  INCOMING
  OUTGOING
}
```

---

## Incoming webhook — HMAC signature validation

```typescript
// backend/src/modules/webhooks/webhook.middleware.ts
import crypto from 'crypto';

// Validate GitHub-style HMAC-SHA256 signature
export function validateWebhookSignature(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const signature = req.headers['x-hub-signature-256'] as string;

    if (!signature) {
      return res.status(401).json({ error: 'Missing webhook signature' });
    }

    // Compute expected HMAC — raw body required (use express.raw() for this route)
    const expected = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(req.body)          // req.body is Buffer when using express.raw()
      .digest('hex');

    // Constant-time comparison — prevents timing attacks
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    // Parse body after verification
    req.body = JSON.parse(req.body.toString());
    next();
  };
}

// Route registration — express.raw() BEFORE JSON parsing for webhook routes:
webhookRouter.post(
  '/github',
  express.raw({ type: 'application/json' }),
  validateWebhookSignature(process.env.GITHUB_WEBHOOK_SECRET!),
  WebhookController.handleGithub,
);
```

---

## Incoming webhook handler

```typescript
// backend/src/modules/webhooks/webhook.service.ts
export class WebhookService {
  static async handleIncoming(source: string, event: string, payload: object, orgId: string) {
    // Log every incoming webhook — even if we don't handle the event type
    const log = await prisma.webhookLog.create({
      data: {
        organizationId: orgId,
        direction:      'INCOMING',
        event,
        source,
        requestBody:    payload,
        success:        false,   // optimistic — updated below
      },
    });

    try {
      await this.processIncomingEvent(source, event, payload, orgId);

      await prisma.webhookLog.update({
        where: { id: log.id },
        data:  { success: true, processedAt: new Date() },
      });
    } catch (err: any) {
      await prisma.webhookLog.update({
        where: { id: log.id },
        data:  { errorMessage: err.message },
      });
      logger.error('[Webhook] Failed to process incoming event', { source, event, error: err.message });
    }
  }

  private static async processIncomingEvent(source: string, event: string, payload: any, orgId: string) {
    // Route to handler based on source + event
    const handler = INCOMING_HANDLERS[`${source}:${event}`];
    if (!handler) {
      logger.info('[Webhook] No handler for event', { source, event });
      return;
    }
    await handler(payload, orgId);
  }
}

// Handler map:
const INCOMING_HANDLERS: Record<string, (payload: any, orgId: string) => Promise<void>> = {
  'stripe:payment_intent.succeeded': handleStripePayment,
  'github:push': handleGithubPush,
};
```

---

## Outgoing webhooks — send with retry

```typescript
// backend/src/modules/webhooks/webhook-sender.service.ts
import axios from 'axios';
import crypto from 'crypto';

export class WebhookSenderService {
  // Send a webhook to a registered endpoint with HMAC signing
  static async send(
    orgId:     string,
    event:     string,
    payload:   object,
    targetUrl: string,
    secret:    string,
  ) {
    const body      = JSON.stringify(payload);
    const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
    const timestamp = Date.now().toString();

    const log = await prisma.webhookLog.create({
      data: { organizationId: orgId, direction: 'OUTGOING', event, url: targetUrl, requestBody: payload, success: false },
    });

    const MAX_ATTEMPTS = 3;
    const BACKOFF      = [0, 5000, 30000];   // 0s, 5s, 30s

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, BACKOFF[attempt]));

      try {
        const res = await axios.post(targetUrl, body, {
          headers: {
            'Content-Type':     'application/json',
            'X-Webhook-Event':  event,
            'X-Webhook-Timestamp': timestamp,
            'X-Hub-Signature-256': signature,
          },
          timeout: 10_000,   // 10s timeout
        });

        await prisma.webhookLog.update({
          where: { id: log.id },
          data:  { statusCode: res.status, responseBody: res.data, success: true, processedAt: new Date(), attemptCount: attempt + 1 },
        });
        return;    // success — stop retrying

      } catch (err: any) {
        const statusCode = err.response?.status;
        const isRetryable = !statusCode || statusCode >= 500;

        await prisma.webhookLog.update({
          where: { id: log.id },
          data:  { statusCode, errorMessage: err.message, attemptCount: attempt + 1 },
        });

        if (!isRetryable) break;    // 4xx errors — don't retry
      }
    }
  }
}
```

---

## Outgoing webhook event catalog

```typescript
// shared/src/webhookEvents.ts — define all outgoing event types
export const WEBHOOK_EVENTS = {
  // Item
  'item.created': 'Fired when a new item is added',
  'item.updated': 'Fired when item details are updated',
  'item.deleted': 'Fired when an item is deactivated',

  // Item status workflow
  'item.submitted':  'Fired when an item is submitted',
  'item.approved':   'Fired when an item is approved',
  'item.rejected':   'Fired when an item is rejected',

  // Report
  'report.processed':'Fired when a report is generated',
} as const;

export type WebhookEvent = keyof typeof WEBHOOK_EVENTS;

// Call from service after state change:
await WebhookSenderService.sendToOrgWebhooks(orgId, 'item.created', {
  item: { id, name, status },
});
```

---

## Webhook subscription model

```prisma
model WebhookSubscription {
  id             String   @id @default(uuid())
  organizationId String
  url            String
  secret         String        // stored encrypted
  events         String[]      // e.g. ['item.created', 'item.approved']
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id])

  @@index([organizationId])
}
```

---

## Checklist

- [ ] Incoming webhooks use `express.raw()` before body parsing — HMAC must be validated on raw bytes
- [ ] HMAC comparison uses `crypto.timingSafeEqual()` — prevents timing attacks
- [ ] Every incoming webhook logged to `WebhookLog` — even unhandled event types
- [ ] Outgoing webhooks retry up to 3 times with exponential backoff
- [ ] 4xx responses NOT retried — only 5xx and timeouts
- [ ] Outgoing request has 10s timeout — never lets slow endpoints block
- [ ] Webhook secret stored encrypted — never in plaintext in the DB
- [ ] Event catalog documented in `shared/src/webhookEvents.ts`
- [ ] `WebhookLog` queryable by org, event type, success/failure — for debugging
- [ ] Failed webhooks surfaced in admin UI with re-trigger option
