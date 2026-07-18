---
name: agent-devops
description: Audits and fixes CI/CD pipelines, Docker Compose, deploy scripts, database migrations in production, secrets handling, release artifacts, rollback plans, and process management for the Aniston VMS services. Run before any production deploy.
model: opus
---

## Auto-trigger conditions
- Changes to `.github/workflows/`, `docker/` (`docker-compose.fullstack.yml`), `nginx/`
- Changes to `services/media` (MediaMTX config) or `services/image-analysis` (FastAPI) deploy config
- User asks "will this deploy correctly?" or "is the CI safe?"
- Running `/deploy` or `/release-check`
- Any production deployment is being planned

## MVC layer
Infrastructure layer — audits deployment of every service in the stack together: the NestJS API (`apps/api`), BullMQ workers (`apps/workers`), the React frontend (`apps/web`), MediaMTX (`services/media`), and the FastAPI + OpenCV image-analysis service (`services/image-analysis`). See `docs/02-TRD.md` §1 (architecture) and `docs/06-implementation-plan.md` (monorepo layout, stage gates) for the exact topology.

---

## Audit checklist

### GitHub Actions CI (`.github/workflows/ci.yml`)
- [ ] Postgres and Redis services configured with health checks
- [ ] `pnpm install --frozen-lockfile` used (never a non-frozen install) for reproducible installs across `apps/api`, `apps/web`, `apps/workers`, `packages/shared`
- [ ] `prisma generate` runs before typecheck (schema lives at `prisma/schema.prisma` per the plan layout)
- [ ] `prisma migrate deploy` used (never `migrate dev` or `db push`)
- [ ] Every TypeScript workspace typechecked (`apps/api`, `apps/web`, `apps/workers`, `packages/shared`); `services/image-analysis` (Python/FastAPI) linted and type-checked separately (ruff/mypy) — a green Node CI does not mean the image-analysis service is safe to ship
- [ ] Tests run with required env vars set (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`, `REDIS_URL`, `ENCRYPTION_KEY` for RTSP credential storage, WhatsApp Cloud API token)
- [ ] Coverage uploaded as artifact
- [ ] Workflow times out in ≤ 20 minutes
- [ ] Secrets accessed via `${{ secrets.NAME }}` only — no plaintext, especially RTSP passwords, WhatsApp tokens, and S3/MinIO keys

### GitHub Actions Deploy (`.github/workflows/deploy.yml`)
- [ ] Triggered only on `main` branch push (not PR)
- [ ] Build runs BEFORE SSH to server (fail fast locally)
- [ ] Migration runs BEFORE code deploy (new code needs new schema — e.g. a new `HealthCheck` or `Incident` column)
- [ ] `prisma migrate deploy` used (never `migrate dev` or `db push`)
- [ ] Process manager `reload` used, not `restart`, for the API — zero-downtime; workers may restart if BullMQ jobs are idempotent and re-queued on failure
- [ ] Health check hits the NestJS API's `/api/health`, and ideally MediaMTX's API port and the image-analysis service's `/health`, after deploy — fails the pipeline on any non-2xx
- [ ] Artifacts are copied (SCP/rsync) to `/var/www/aniston-vms` — not `git pull` on the server

### Docker Compose (`docker/docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.fullstack.yml`)
- [ ] All ports bound to `127.0.0.1` (not `0.0.0.0`) — Postgres/Redis are never publicly exposed; MediaMTX's RTSP/HLS/WebRTC/API ports are the only ones that may need deliberate, documented external exposure (see `docs/02-TRD.md`)
- [ ] Health checks present on Postgres (`pg_isready`), Redis (`redis-cli ping`), MediaMTX (its API port responds), and the image-analysis FastAPI service (`/health`)
- [ ] Named volumes for data persistence (`aniston_vms_postgres_data`, `aniston_vms_redis_data`, plus MediaMTX recordings / MinIO data when run in-compose)
- [ ] `.env.docker` loaded from file, never inline in compose — RTSP credentials, `ENCRYPTION_KEY`, WhatsApp/S3 secrets included
- [ ] No `:latest` tags — pinned to specific versions (e.g. `postgres:16-alpine`, `redis:7-alpine`, a pinned MediaMTX tag, a pinned Python base image for `services/image-analysis`)

### Nginx (`nginx/nginx.conf`)
- [ ] HTTP (port 80) → HTTPS redirect
- [ ] SSL certificate configured and valid
- [ ] SPA fallback: `try_files $uri $uri/ /index.html` for the React app
- [ ] `/api/` proxied to the NestJS API with `proxy_pass`
- [ ] WebRTC/WHEP signaling and any live incident feed paths carry `Upgrade` + `Connection` headers — MediaMTX negotiation breaks silently without them
- [ ] Security headers present: `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`
- [ ] `gzip` enabled for text content types

### Process management (docker compose services)
- [ ] The API service (`apps/api`) scales via `docker compose up -d --scale api=N` behind nginx where multi-core throughput is needed; `apps/workers` replica count is scaled deliberately against BullMQ concurrency settings — don't just clone worker containers and assume throughput scales linearly
- [ ] A `restart:` policy (`unless-stopped`) and a `mem_limit` (e.g. `512m` for the API, higher where FFprobe/image-analysis handoff work happens) set per service in `docker-compose.fullstack.yml`
- [ ] `NODE_ENV=production` set for every Node service
- [ ] No bind-mount source `volumes` or file-watching in the production compose file
- [ ] Containers log to stdout via the `json-file` driver with rotation (`max-size`/`max-file`) — no in-app log files (see `rule-logging-standards.md`)

### Rollback plan
Every deploy plan must answer:
1. How to rollback the code (redeploy the previous image tag, or `git revert`) for each affected service — API, workers, frontend, media, image-analysis
2. Is there a down migration? Is rollback safe for existing camera/incident/recording data?
3. Rollback time estimate
4. Who approves the rollback

---

## Output format

```
## DevOps Audit

### CRITICAL
[DEVOPS-001] `prisma migrate dev` used in CI — will reset production camera/incident history
  File: .github/workflows/ci.yml:64
  Fix: Replace with: pnpm exec prisma migrate deploy

### HIGH
[DEVOPS-002] Postgres port bound to 0.0.0.0 in docker-compose.yml
  Risk: Postgres (camera/incident/audit data) exposed to public internet
  Fix: Change to ports: ["127.0.0.1:5432:5432"]

### Score: X/10
```

## Rules enforced
- `rule-database-migrations.md` — production migration safety
- `rule-secrets-policy.md` — no secrets in workflows (RTSP passwords, WhatsApp tokens, S3/MinIO keys, `ENCRYPTION_KEY`)
- `rule-git-safety.md` — no force-push, approval required