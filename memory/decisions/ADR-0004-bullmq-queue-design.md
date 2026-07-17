# ADR-0004 — BullMQ for Background Job Processing

**Date:** 2026-05-20
**Status:** Accepted
**Deciders:** Aniston Technologies LLP

---

## Context

The application needs to perform several operations that should not block HTTP request handling:
- Sending welcome/notification emails
- Generating PDF/Excel reports
- Processing large CSV imports
- Delivering in-app and push notifications

Options evaluated:
1. **BullMQ** (Redis-backed persistent queue)
2. **Cron jobs** (`node-cron` or similar)
3. **In-process async** (fire-and-forget `setImmediate`)
4. **Separate message broker** (RabbitMQ, SQS)

---

## Decision

Use **BullMQ** backed by the existing Redis instance.

---

## Rationale

| Criterion | BullMQ | Cron | In-process async | RabbitMQ/SQS |
|-----------|--------|------|-----------------|--------------|
| Persistent on crash | ✅ Redis | ❌ | ❌ | ✅ |
| Retries with backoff | ✅ Built-in | ❌ manual | ❌ | ✅ |
| Progress tracking | ✅ `job.updateProgress()` | ❌ | ❌ | ❌ |
| UI for monitoring | ✅ Bull Board | ❌ | ❌ | ✅ (complex) |
| No new infra | ✅ reuses Redis | ✅ | ✅ | ❌ |
| Priority queues | ✅ | ❌ | ❌ | ✅ |
| Rate limiting | ✅ Built-in | ❌ | ❌ | ❌ |

BullMQ wins on all dimensions that matter for this application while requiring no additional infrastructure (Redis is already present for caching and rate limiting).

---

## Job types defined

| Queue name | Job type | Max attempts | Backoff |
|-----------|---------|-------------|---------|
| `email` | welcome-employee, leave-approved, etc. | 3 | exponential, 5s |
| `notification` | in-app notification creation + socket emit | 3 | exponential, 2s |
| `export` | PDF/Excel report generation | 2 | fixed, 10s |
| `import` | CSV employee import | 1 | none (no re-run) |

---

## Consequences

- BullMQ workers must be started alongside the Express server in `jobs/index.ts`
- Jobs must be idempotent where possible (export: safe to re-run; import: not idempotent, max 1 attempt)
- Failed jobs retained for 7 days (`removeOnFail: { count: 50 }`) for debugging
- Completed jobs retained for 24 hours (`removeOnComplete: { count: 100 }`)
- Bull Board dashboard available at `/api/admin/queues` (ADMIN only)

## How to apply

Read `skill-background-jobs-patterns.md` before adding any new queue or worker.
Never add business logic inside a worker — workers call service methods.
