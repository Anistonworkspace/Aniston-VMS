---
name: deploy
description: Deploy Aniston VMS to production. Runs pre-deploy checks, builds the pnpm monorepo, migrates the DB, and brings up the Docker services via GitHub Actions or manual SSH.
---

Pre-deploy checklist (run before deploying):

1. Run /release-check and confirm there are no CRITICAL or HIGH findings
2. Confirm all tests pass: `pnpm test` (and `pnpm test:e2e` if Playwright specs touched a critical flow)
3. Confirm you are on main branch with no uncommitted changes
4. Confirm the git tag is ready: git tag v<version>

Deploy via GitHub Actions (recommended):
- Push to main branch — CI/CD runs automatically
- Monitor .github/workflows/deploy.yml for progress
- The workflow: `pnpm install --frozen-lockfile` → `pnpm lint && pnpm typecheck && pnpm build` (apps/api, apps/web, apps/workers, services/image-analysis) → sync to server → `prisma migrate deploy` → `docker compose up -d --build`

Manual deploy (if CI is unavailable):
1. SSH to the production server
2. cd /var/www/aniston-vms
3. git pull origin main
4. pnpm install --frozen-lockfile
5. pnpm build
6. DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @aniston-vms/api exec prisma migrate deploy   ← ALWAYS migrate BEFORE bringing services up
7. docker compose -f docker/docker-compose.yml up -d --build   (postgres, redis, api, workers, web, media/MediaMTX, image-analysis)

Post-deploy verification:
- GET https://your-domain.com/api/health → expect 200 with all subsystems up (DB, Redis, MediaMTX, image-analysis reachable)
- Login with a test account per role (SUPER_ADMIN, PROJECT_ADMIN, CLIENT_VIEWER) and verify the primary workflow works (live wall loads, an incident can be acknowledged)
- Monitor container logs for 5 minutes: `docker compose logs -f api workers`

Rollback (if post-deploy verification fails):
- git checkout <last-good-commit> on the server
- Rebuild and restart: `pnpm build && docker compose -f docker/docker-compose.yml up -d --build`
- NEVER auto-rollback. Report the error and wait for human decision before any rollback.

CRITICAL: Never run `prisma db push` in production. Always use `prisma migrate deploy`.
