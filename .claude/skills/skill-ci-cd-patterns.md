# Skill — CI/CD Patterns

Aniston VMS is a **pnpm** monorepo (`apps/api`, `apps/web`, `apps/workers`, `services/media`,
`services/image-analysis`, `packages/shared` — see root `pnpm-workspace.yaml`). GitHub Actions runs
CI on every PR/push to `main`, and deploys `main` straight to the single production host via
`deploy.yml`. Mobile/desktop release workflows build the deferred Capacitor/Electron shells (see
`skill-capacitor-patterns.md`, `skill-electron-patterns.md`). Canon for stack, layout and stage
gates: `docs/06-implementation-plan.md` and `docs/02-TRD.md §1` (architecture) — never the current
on-disk scaffold.

Monorepo layout the pipeline builds and ships (per `docs/06-implementation-plan.md`):

```
apps/api                 # NestJS API                 (@aniston-vms/api)
apps/web                 # React + Vite control room   (@aniston-vms/web)
apps/workers             # BullMQ workers              (@aniston-vms/workers)
services/media           # MediaMTX config/adapter (RTSP ingest)
services/image-analysis  # FastAPI + OpenCV (Python) camera-health analysis
packages/shared          # shared types / enums / permissions (@aniston-vms/shared)
prisma/                  # schema.prisma + seed.ts
```

---

## CI workflow (`.github/workflows/ci.yml`)

Prisma generate → Typecheck → Lint → Test → Build, against real Postgres 16 + Redis 7 service
containers (migrations run against a throwaway `aniston_vms_test` DB, not mocks). Every TS workspace
(`apps/api`, `apps/web`, `apps/workers`, `packages/shared`) is checked independently, and the Python
`services/image-analysis` service is linted/type-checked on its own toolchain — a green Node job
never implies the FastAPI + OpenCV service is safe to ship.

```yaml
name: CI
on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: aniston_vms_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
        options: >-
          --health-cmd "redis-cli ping" --health-interval 10s --health-timeout 5s --health-retries 5
    env:
      NODE_ENV: test
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/aniston_vms_test
      REDIS_URL: redis://localhost:6379
      JWT_SECRET: ci-test-jwt-secret-32chars-minimum-xx
      JWT_REFRESH_SECRET: ci-test-refresh-secret-32chars-min
      ENCRYPTION_KEY: "0000000000000000000000000000000000000000000000000000000000000000"
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "pnpm" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec prisma generate --schema=prisma/schema.prisma
      - run: pnpm exec prisma migrate deploy --schema=prisma/schema.prisma
      # Typecheck every TS workspace independently
      - run: pnpm --filter @aniston-vms/shared exec tsc --noEmit
      - run: pnpm --filter @aniston-vms/api exec tsc --noEmit
      - run: pnpm --filter @aniston-vms/web exec tsc --noEmit
      - run: pnpm --filter @aniston-vms/workers exec tsc --noEmit
      - run: pnpm -r lint
      - run: pnpm --filter @aniston-vms/api test
      - run: pnpm --filter @aniston-vms/workers test
      - run: pnpm --filter @aniston-vms/web test
      - run: pnpm --filter @aniston-vms/web build
      - run: pnpm --filter @aniston-vms/api build
      # Python camera-health service runs on its own toolchain
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -r services/image-analysis/requirements.txt
      - run: ruff check services/image-analysis && mypy services/image-analysis
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-reports
          path: |
            apps/api/coverage/
            apps/web/coverage/
            apps/workers/coverage/
```

`ENCRYPTION_KEY` in CI is an all-zero dummy, exactly long enough to pass the AES-256-GCM key-length
check (see `skill-encryption-patterns.md`) — never reuse it anywhere real. Real RTSP credentials,
WhatsApp Cloud API tokens and S3/MinIO keys never appear in CI: the suite runs entirely on dummy env
values above.

---

## Deploy workflow (`.github/workflows/deploy.yml`)

Build → `prisma migrate deploy` → rsync to the production host → `docker compose up -d` → health check. One
production host, no blue/green yet (see `docs/06-implementation-plan.md` for when that's planned).
The migration runs BEFORE the container recreate, because new NestJS code expects the new schema (e.g. a
fresh `HealthCheck` / `Incident` column):

```yaml
name: Deploy to Production
on:
  push:
    branches: [main]
    paths-ignore: ["**.md", ".claude/**", "memory/**"]

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "pnpm" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec prisma generate --schema=prisma/schema.prisma
      - run: pnpm --filter @aniston-vms/web build
        env: { VITE_API_URL: "${{ secrets.PROD_API_URL }}" }
      - run: pnpm --filter @aniston-vms/api build
      - run: pnpm --filter @aniston-vms/workers build
      - name: Set up SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.SSH_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          ssh-keyscan -H "${{ secrets.DEPLOY_HOST }}" >> ~/.ssh/known_hosts
      - name: Sync build to server
        run: |
          rsync -avz --delete -e "ssh -i ~/.ssh/deploy_key" \
            --exclude='.git' --exclude='node_modules' --exclude='.env' \
            ./ "${{ secrets.DEPLOY_USER }}@${{ secrets.DEPLOY_HOST }}:/var/www/aniston-vms/"
      - name: Install prod deps on server
        run: |
          ssh -i ~/.ssh/deploy_key "${{ secrets.DEPLOY_USER }}@${{ secrets.DEPLOY_HOST }}" \
            "cd /var/www/aniston-vms && pnpm install --frozen-lockfile --prod"
      - name: Run database migrations
        run: |
          ssh -i ~/.ssh/deploy_key "${{ secrets.DEPLOY_USER }}@${{ secrets.DEPLOY_HOST }}" \
            "cd /var/www/aniston-vms && DATABASE_URL='${{ secrets.PROD_DATABASE_URL }}' pnpm exec prisma migrate deploy"
      - name: Deploy containers (rolling recreate of changed services)
        run: |
          ssh -i ~/.ssh/deploy_key "${{ secrets.DEPLOY_USER }}@${{ secrets.DEPLOY_HOST }}" \
            "cd /var/www/aniston-vms && docker compose -f docker-compose.fullstack.yml pull && docker compose -f docker-compose.fullstack.yml up -d"
      - name: Verify health
        run: |
          sleep 5
          curl --fail --silent "${{ secrets.PROD_API_URL }}/api/health" || exit 1
      - name: Notify on failure
        if: failure()
        run: echo "Deploy failed — inspect container logs: docker compose logs --tail=200 api"
```

`/var/www/aniston-vms` is the deploy target, holding the checked-out repo and
`docker-compose.fullstack.yml`, which runs the two Node services (the sidecar services are defined in
the same compose file):

```yaml
# docker-compose.fullstack.yml (excerpt)
services:
  api:
    build: { context: ., dockerfile: apps/api/Dockerfile }
    environment: { NODE_ENV: production, PORT: 4000 }
    restart: unless-stopped
  workers:
    build: { context: ., dockerfile: apps/workers/Dockerfile }
    environment: { NODE_ENV: production }
    restart: unless-stopped
```

`services/media` (MediaMTX, RTSP ingest) and `services/image-analysis` (FastAPI + OpenCV camera
health) run as their own containers (see `docker/docker-compose.fullstack.yml` and
`agent-devops.md`) — so the verify step should also confirm MediaMTX's API port and
the image-analysis `/health` after deploy. Rolling `docker compose up -d` recreates only the services
whose image or config changed, so unchanged containers keep serving; recreating `apps/workers` is safe
because BullMQ jobs are idempotent and re-queued on failure.

---

## Mobile/desktop release workflows (deferred capability)

Capacitor Android/iOS and the Electron live-wall shell (see their skill files) build via
`store-releases/{android,ios,electron}/` scripts from dedicated release workflows — NOT part of the
default `ci.yml`/`deploy.yml` path, since neither is required for Aniston VMS v1 (a control-room web
app). Both wrap the same `apps/web` bundle:

```yaml
# .github/workflows/release-android.yml (excerpt) — see skill-capacitor-patterns.md
- uses: pnpm/action-setup@v4
  with: { version: 9 }
- uses: actions/setup-java@v4
  with: { distribution: "temurin", java-version: "17" }
- run: pnpm install --frozen-lockfile
- run: pnpm --filter @aniston-vms/web build
- run: npx cap sync android
  working-directory: apps/web
- name: Decode keystore
  run: echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 --decode > android/app/release.jks
  working-directory: apps/web
- run: ./gradlew bundleRelease
  working-directory: apps/web/android
  env:
    KEYSTORE_PASSWORD: "${{ secrets.ANDROID_KEYSTORE_PASSWORD }}"
    KEY_ALIAS: "${{ secrets.ANDROID_KEY_ALIAS }}"
    KEY_PASSWORD: "${{ secrets.ANDROID_KEY_PASSWORD }}"
- uses: actions/upload-artifact@v4
  with: { name: release-aab, path: apps/web/android/app/build/outputs/bundle/release/ }
```

```yaml
# .github/workflows/release-electron.yml (excerpt) — see skill-electron-patterns.md
- uses: pnpm/action-setup@v4
  with: { version: 9 }
- run: pnpm install --frozen-lockfile
- run: pnpm --filter @aniston-vms/web build
- run: pnpm --filter agent-desktop build       # electron-builder → NSIS/DMG, appId com.aniston.vms
  env:
    CSC_LINK: "${{ secrets.WINDOWS_CERT_FILE }}"
    CSC_KEY_PASSWORD: "${{ secrets.WINDOWS_CERT_PASSWORD }}"
```

Required secrets by workflow: CI needs none beyond the checked-in dummy env above; Deploy needs
`SSH_KEY` / `DEPLOY_HOST` / `DEPLOY_USER` / `PROD_API_URL` / `PROD_DATABASE_URL` (plus the production
`JWT_SECRET` / `JWT_REFRESH_SECRET` / `ENCRYPTION_KEY` / WhatsApp / S3 secrets loaded on the host,
never in the workflow); Android release needs `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD`
/ `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD`; Electron release needs `WINDOWS_CERT_FILE` /
`WINDOWS_CERT_PASSWORD`.

---

## Checklist before shipping a CI/CD change

- [ ] `pnpm install --frozen-lockfile` in CI and on the deploy target (never a non-frozen install; pnpm only) — lockfile fidelity
- [ ] Every TS workspace (`apps/api`, `apps/web`, `apps/workers`, `packages/shared`) typechecked/tested independently; `services/image-analysis` linted (ruff/mypy) on its own
- [ ] `prisma generate` before typecheck; `prisma migrate deploy` in prod — never `migrate dev` or `db push --accept-data-loss`
- [ ] Deploy target is `/var/www/aniston-vms`, matching `docker-compose.fullstack.yml` (the `api` service builds from `apps/api`, the `workers` service from `apps/workers`)
- [ ] Health step actually fails the job (`--fail`) if `/api/health` doesn't return 2xx; MediaMTX + image-analysis `/health` also confirmed
- [ ] Signing secrets (`ANDROID_*`, `WINDOWS_CERT_*`) and RTSP/WhatsApp/S3 secrets referenced only via `secrets.*`, never inline
