---
name: release-check
description: Pre-release quality gate for Aniston VMS. Run before any production deploy or store submission. Checks code quality, test coverage, security, database migrations, service health, and release artifacts across apps/* and services/*.
---

This is the final gate before a production release of Aniston VMS. All items must pass.
Canon: `docs/02-TRD.md`, `docs/06-implementation-plan.md`, `memory/alignment-dictionary.md`.

**Code quality**
- [ ] TypeScript compiles with no errors: `pnpm -r typecheck` (`apps/api`, `apps/web`, `apps/workers`, `packages/shared`)
- [ ] ESLint passes with no errors: `pnpm -r lint` (warnings are acceptable)
- [ ] No `console.log`/`debugger` statements added in `apps/api/` or `apps/workers/` (use the `Logger` — see `rule-completion-standards.md`)

**Tests**
- [ ] All Vitest unit/integration tests pass: `pnpm -r test`
- [ ] All Playwright E2E tests pass: `pnpm --filter @aniston-vms/web test:e2e`
- [ ] Coverage meets thresholds (`rule-testing-standards.md`): backend service ≥ 80%, utilities ≥ 90%,
      frontend critical components (auth, forms, incident/live-wall views) ≥ 70%
- [ ] RBAC + zone-scope matrix covered: `SUPER_ADMIN` / `PROJECT_ADMIN` / `CLIENT_VIEWER` × in-scope/out-of-scope
      zone/site/camera for every critical route

**Security**
- [ ] Run `/security-scan` and confirm no CRITICAL or HIGH findings
- [ ] No hardcoded secrets in the codebase (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, `DATABASE_URL`, `REDIS_URL`)
- [ ] `.env` not committed to git
- [ ] Camera/router credential fields (`rtspUsernameEncrypted`, `rtspPasswordEncrypted`, `mainRtspUrlEncrypted`,
      `subRtspUrlEncrypted`, SIM PINs) remain AES-256-GCM encrypted at rest and are never returned in any API response

**Database**
- [ ] All Prisma migrations applied in the staging environment: `pnpm exec prisma migrate deploy`
- [ ] Migration tested on a clone of production data
- [ ] Rollback migration tested
- [ ] Enum sync verified: `packages/shared/src/enums.ts` matches `prisma/schema.prisma` (`CameraStatus`,
      `IncidentStatus`, `NotificationStatus`, `ScopeType`, diagnosis-code catalog)

**Performance**
- [ ] No new N+1 Prisma queries introduced (`/optimize`, `agent-performance`)
- [ ] Lighthouse score ≥ 85 for Performance, Accessibility, Best Practices on `apps/web`
- [ ] Live-wall/dashboard targets hold per `docs/02-TRD.md`: API p95 latency, live-stream start time,
      playback start time within budget under a realistic camera-count load

**Services**
- [ ] `services/media` (MediaMTX) config validated; on-demand RTSP → WebRTC/HLS smoke test passes for at
      least one camera per codec path in use
- [ ] `services/image-analysis` (FastAPI + OpenCV) health endpoint returns healthy
- [ ] `apps/workers` BullMQ queues (health-probe, snapshot, image-analysis, notifications, escalation) drain
      with 0 failed jobs on a smoke run
- [ ] `docker/docker-compose.yml` builds and starts every service (api, web, workers, media, image-analysis,
      postgres, redis) cleanly

**Mobile/PWA**
- [ ] PWA installs correctly on Android Chrome
- [ ] Offline fallback (`frontend/public/offline.html`) works
- [ ] Layout tested at 375px — no overflow on live-wall/incident views
- [ ] Capacitor shell builds if shipping to app stores this release

**Release artifacts (if shipping to stores)**
- [ ] Android: see `store-releases/android/PUBLISH_CHECKLIST.md`
- [ ] iOS: see `store-releases/ios/PUBLISH_CHECKLIST.md`
- [ ] Windows EXE: see `store-releases/electron/PUBLISH_CHECKLIST.md`

**Git hygiene**
- [ ] Version bumped in `package.json`
- [ ] `CHANGELOG.md` updated
- [ ] Git tag created: `git tag v<version>`

Only proceed to deploy after all items are checked.
