---
name: health
description: Check that the development environment is running correctly. Verifies all services, environment variables, database connectivity, and tooling.
---

Check the following and report pass/fail for each:

**Node.js and npm**
- node --version (expect 20+)
- npm --version (expect 10+)
- node_modules/ exists at repo root (npm install has been run)

**Environment**
- .env file exists (not just .env.example)
- Required vars present: DATABASE_URL, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY, SMTP_HOST
- ENCRYPTION_KEY is exactly 64 hex characters (32 bytes for AES-256)

**Docker services**
- docker ps shows postgres container running
- docker ps shows redis container running
- PostgreSQL reachable at DATABASE_URL
- Redis reachable at REDIS_URL

**TypeScript**
- npx tsc --noEmit in backend/ passes with no errors
- npx tsc --noEmit in frontend/ passes with no errors
- Prisma client is generated (node_modules/@prisma/client exists)

**Database**
- Database exists and migrations are applied (npx prisma migrate status)
- At least the seed org/user exists (basic connectivity check)

**Dev servers**
- Backend: GET http://localhost:4000/api/health returns 200
- Frontend: GET http://localhost:5173 returns 200

Report each check as ✅ PASS, ⚠️ WARN, or ❌ FAIL with a fix command for each failure.
