# ADR-0007 — Redis as Rate Limit Store

**Date:** 2026-05-20
**Status:** Accepted
**Deciders:** Aniston Technologies LLP

---

## Context

The API needs rate limiting for auth routes (50/15min) and general routes (100/min). The rate limit store choice has significant implications in multi-instance deployments.

Options:
1. **In-memory** (`express-rate-limit` default) — counter lives in the Node.js process
2. **Redis** (`rate-limit-redis`) — counter in the shared Redis instance
3. **Database** (Prisma-based counter) — counter in PostgreSQL

---

## Decision

Use **Redis** (`rate-limit-redis`) with the existing Redis instance.

---

## Rationale

**In-memory is silently broken in production.**

When the app runs as PM2 cluster (`instances: "max"` = one per CPU), each process has its own in-memory counter. A user can send N requests to each of the M processes before any single process hits the limit. Effective limit becomes `N × M` instead of `N`. On a 4-core server, the actual auth limit would be 200/15min instead of 50/15min — a 4× security degradation with no error or warning.

| Store | Works in cluster | Extra infra | Latency |
|-------|-----------------|------------|---------|
| In-memory | ❌ | None | ~0ms |
| Redis | ✅ | None (already present) | ~1ms |
| Database | ✅ | None (already present) | ~5ms |

Redis is already running for caching and BullMQ. Adding rate limit counters to the same Redis instance adds negligible load (counters are tiny INCR operations) and requires no new infrastructure.

Database was rejected because Prisma write transactions for every request (even before auth) would add measurable latency on the hot path and create write contention on the users table.

---

## Consequences

- `rate-limit-redis` package added to backend dependencies
- Rate limit store uses the existing `redisClient` from `backend/src/lib/redis.ts`
- Redis key prefix: `rl:auth:`, `rl:api:`, `rl:heavy:` to avoid collision with cache keys
- If Redis goes down, rate limiting fails open (requests proceed) — acceptable for availability
- `RateLimit-*` standard headers always enabled so clients can self-throttle

## How to apply

Read `skill-rate-limiting-patterns.md` for the full implementation.
Never use `express-rate-limit` without passing a `store` option — the default is in-memory.
