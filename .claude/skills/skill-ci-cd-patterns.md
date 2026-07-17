# Skill — CI/CD Patterns

GitHub Actions workflows for CI (lint + test + typecheck), deploy to EC2, and release (APK + EXE).

---

## CI workflow — runs on every PR and push to main

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  ci:
    name: Lint · Typecheck · Test
    runs-on: ubuntu-latest
    timeout-minutes: 20

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: boilerplate_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
        options: --health-cmd "redis-cli ping" --health-interval 10s --health-timeout 5s --health-retries 5

    env:
      NODE_ENV: test
      DATABASE_URL: postgresql://test:test@localhost:5432/boilerplate_test
      REDIS_URL: redis://localhost:6379
      JWT_SECRET: test-jwt-secret-min-32-chars-long-here
      FRONTEND_URL: http://localhost:5173
      PORT: 4000

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Generate Prisma client
        run: npm run db:generate

      - name: Apply migrations
        run: npx prisma migrate deploy --schema=prisma/schema.prisma

      - name: Lint
        run: npm run lint

      - name: Typecheck
        run: npm run typecheck

      - name: Test
        run: npm run test -- --coverage

      - name: Upload coverage report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage
          path: coverage/
          retention-days: 7
```

---

## Deploy workflow — runs on push to main after CI passes

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  workflow_run:
    workflows: [CI]
    branches: [main]
    types: [completed]

jobs:
  deploy:
    name: Deploy to EC2
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    timeout-minutes: 30
    environment: production

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci --omit=dev

      - name: Build frontend
        run: npm run build --workspace=frontend
        env:
          VITE_API_URL: ${{ secrets.PROD_API_URL }}

      - name: Build backend
        run: npm run build --workspace=backend

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USER }}
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            set -e
            cd /var/www/boilerplate
            git pull origin main
            npm ci --omit=dev
            npm run db:generate
            DATABASE_URL=${{ secrets.DATABASE_URL }} npx prisma migrate deploy --schema=prisma/schema.prisma
            pm2 reload ecosystem.config.cjs --update-env
            pm2 save
```

---

## Android APK release workflow

```yaml
# .github/workflows/release-android.yml
name: Release Android

on:
  workflow_dispatch:
    inputs:
      track:
        description: "Play Store track (internal/alpha/beta/production)"
        required: true
        default: internal

jobs:
  build:
    name: Build and sign APK/AAB
    runs-on: ubuntu-latest
    timeout-minutes: 45

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - uses: actions/setup-java@v4
        with:
          java-version: "17"
          distribution: "temurin"

      - uses: android-actions/setup-android@v3

      - name: Install Node deps
        run: npm ci

      - name: Build frontend
        run: npm run build --workspace=frontend

      - name: Sync Capacitor
        run: npx cap sync android
        working-directory: frontend

      - name: Decode keystore
        run: |
          echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 --decode > android/app/release.jks
        working-directory: frontend

      - name: Build release AAB
        run: ./gradlew bundleRelease
        working-directory: frontend/android
        env:
          KEYSTORE_PATH: app/release.jks
          KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}

      - name: Upload AAB artifact
        uses: actions/upload-artifact@v4
        with:
          name: android-release
          path: frontend/android/app/build/outputs/bundle/release/*.aab
          retention-days: 14
```

---

## Electron Windows EXE release workflow

```yaml
# .github/workflows/release-electron.yml
name: Release Electron

on:
  workflow_dispatch:

jobs:
  build:
    name: Build Windows EXE
    runs-on: windows-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install deps
        run: npm ci

      - name: Build frontend
        run: npm run build --workspace=frontend

      - name: Build and package Electron
        run: npm run dist --workspace=agent-desktop
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          CSC_LINK: ${{ secrets.WINDOWS_CERT_FILE }}
          CSC_KEY_PASSWORD: ${{ secrets.WINDOWS_CERT_PASSWORD }}

      - name: Upload EXE artifact
        uses: actions/upload-artifact@v4
        with:
          name: windows-installer
          path: agent-desktop/dist-release/*.exe
          retention-days: 14
```

---

## Required GitHub Secrets

| Secret | Purpose |
|--------|---------|
| `EC2_HOST` | Production server IP |
| `EC2_USER` | SSH username (e.g. `ubuntu`) |
| `EC2_SSH_KEY` | Private key for SSH access |
| `DATABASE_URL` | Production PostgreSQL URL |
| `PROD_API_URL` | Production backend URL (injected as VITE_API_URL) |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w 0 release.jks` output |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias |
| `ANDROID_KEY_PASSWORD` | Key password |
| `WINDOWS_CERT_FILE` | Path to .pfx code-signing cert |
| `WINDOWS_CERT_PASSWORD` | PFX password |

---

## PM2 ecosystem config

```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'boilerplate-api',
      script: 'backend/dist/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
    },
  ],
};
```

---

## Checklist

- [ ] CI job runs on every PR — no PR merges without green CI
- [ ] Migrations run BEFORE `pm2 reload` — never after
- [ ] Secrets stored in GitHub Secrets — never in YAML values or `.env` committed
- [ ] `--omit=dev` on production installs — no devDependencies on server
- [ ] Android keystore never committed — stored as `ANDROID_KEYSTORE_BASE64` secret
- [ ] EXE artifacts uploaded to GitHub Releases — never committed to repo
- [ ] `workflow_dispatch` on release workflows — triggered manually, not on every push
- [ ] Coverage artifact uploaded on CI for review
