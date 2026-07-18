---
name: health
description: Check that the development environment is running correctly. Verifies all services, environment variables, database connectivity, and tooling.
---

Check the following and report pass/fail for each:

**Node.js and npm**
- node --version (expect 20+)
- npm --version (expect 10+)
- node_modules/ exists at repo root (pnpm install has been run — pnpm workspaces: apps/api, apps/workers, frontend, packages/shared)

**Environment**
- .env file exists (not just .env.example)
- Required vars present: DATABASE_URL, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY, SMTP_HOST
- ENCRYPTION_KEY is exactly 64 hex characters (32 bytes for AES-256 — encrypts RTSP creds, SIM PINs, API keys at rest)
- HEALTH_SCHEDULER_ENABLED, HEALTH_CHECK_INTERVAL_MINUTES, HEALTH_CAMS_PER_MINUTE present (camera health-check cadence)

**Docker services**
- `docker ps` shows `aniston_vms_postgres` running
- `docker ps` shows `aniston_vms_redis` running
- PostgreSQL reachable at DATABASE_URL
- Redis reachable at REDIS_URL

**TypeScript**
- `npx tsc --noEmit` in backend/ passes with no errors
- `npx tsc --noEmit` in frontend/ passes with no errors
- Prisma client is generated (node_modules/@prisma/client exists)

**Database**
- Migrations applied: `npx prisma migrate status --schema=prisma/schema.prisma` (or `pnpm db:migrate -- status`)
- Seed data exists: at least one SUPER_ADMIN user and the Region → Zone → Site hierarchy (`pnpm db:seed` if missing — basic connectivity + RBAC smoke check)

**Background jobs (BullMQ)**
- Redis has active BullMQ queues (health-check, notification) — no camera stuck at `UNKNOWN` status for longer than HEALTH_CHECK_INTERVAL_MINUTES
- Health-check scheduler is ticking (HEALTH_SCHEDULER_ENABLED=true): most recent `HealthCheck.checkedAt` is within the last few minutes

**Dev servers**
- Backend: GET http://localhost:4000/api/health returns 200
- Frontend: GET http://localhost:5173 returns 200

Report each check as ✅ PASS, ⚠️ WARN, or ❌ FAIL with a fix command for each failure.
