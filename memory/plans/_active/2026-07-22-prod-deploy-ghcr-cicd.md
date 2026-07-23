# Plan — Isolated GHCR push-to-deploy CI/CD for vms.anistonav.com

**Owner:** claude · **Started:** 2026-07-22 · **Status:** ACTIVE

## Goal
On `git push` to `main`, GitHub Actions builds the VMS backend + frontend Docker
images, pushes them to GHCR, then SSHes into the shared EC2 host, pulls the images,
runs DB migrations, and brings the stack live behind `https://vms.anistonav.com` —
**without touching any other application, container, volume, nginx vhost, or cert on
the box.**

## Hard constraints (binding)
- **Isolation:** shared host runs ~17 other containers / 9 vhosts / 7 certs. Do not
  touch them. Enforce via:
  - Fixed compose project name `aniston-vms` → volumes `aniston-vms_postgres_data` /
    `aniston-vms_redis_data`, network `aniston-vms_default` (no collisions).
  - Exactly ONE published host port: `127.0.0.1:8095 → frontend:80`. Postgres, Redis,
    backend, MediaMTX publish nothing (private network only). Backend's internal :4000
    never collides with the host PM2 :4000.
  - `docker image prune -f` only (dangling/untagged) — never `system prune`.
  - Host nginx: add ONE new vhost + certbot for `vms.anistonav.com` only.
- **Secrets:** `PROD_ENV_FILE` lives only in GitHub secrets → written to
  `~/aniston-vms/.env` (chmod 600) over SSH; never committed, never via local redirect.
  GHCR pull auth uses the ephemeral `GITHUB_TOKEN` piped over stdin (no new secret,
  images stay private).
- **Strict production:** NODE_ENV=production; env.ts requires JWT_SECRET(≥32),
  JWT_REFRESH_SECRET(≥32), ENCRYPTION_KEY(64 hex), MEDIA_URL_SIGNING_SECRET;
  ALERT_MOCK_MODE=false + PLAYBACK_SIM_MODE=false (else boot-crash).
- **git-safety:** show full diff + get explicit approval before any push to `main`
  (deploy builds from pushed main). No worktrees.

## Build strategy (user-confirmed)
CI → GHCR, server pulls. Nothing is built on the 86%-full EC2 disk.

## Artifacts
1. `docker/docker-compose.prod.yml` — GHCR images, project `aniston-vms`, frontend on
   127.0.0.1:8095 only, no other host ports, `env_file: ../.env`, MEDIAMTX_API_URL
   internal, mounts `../simulator/mediamtx.yml`.
2. `scripts/deploy-prod.sh` — idempotent: pull → up data tier → wait healthy →
   `prisma migrate deploy` via throwaway node:20-alpine container on
   `aniston-vms_default` → up app tier → health via 127.0.0.1:8095 → prune dangling.
3. `.github/workflows/deploy.yml` — replace PM2 flow: build+push backend+frontend to
   GHCR (frontend build-arg VITE_API_URL=https://vms.anistonav.com, packages:write) →
   SSH: git reset --hard origin/main → write .env from secret → docker login ghcr
   (stdin) → run deploy-prod.sh.
4. `nginx/vms.anistonav.com.conf` — host vhost, single upstream 127.0.0.1:8095,
   ws-upgrade aware; certbot adds the 443 block on the server.

## Migrations
3 committed migrations exist (`init`, `v1_5_permissions_storage_backups`,
`add_audit_scope_columns`) → `prisma migrate deploy` builds the schema. Prisma CLI is
a devDep (absent from runtime image) → run via throwaway container, not in the image.

## One-time server bootstrap (manual SSH, after approval)
- Verify 8095 free (`ss -ltn`); `git clone` → `~/aniston-vms`.
- Install nginx vhost + `$connection_upgrade` map if absent → `nginx -t` → reload.
- `certbot --nginx -d vms.anistonav.com` (only this domain).
- One-time admin seed: `ALLOW_PROD_SEED=true ADMIN_PASSWORD=… npm run db:seed:admin`
  (NOT in the recurring workflow).

## Verify
Live HTTPS, admin login, and all other containers/volumes/vhosts/certs untouched
(`docker ps`, `docker volume ls`, `nginx -T`, `certbot certificates` diff vs. recon).

## Steps
1. [x] Recon + isolation map
2. [x] Setup gate (npm install exit 0)
3. [ ] Draft 4 artifacts
4. [ ] Adversarial review (devops + security)
5. [ ] Apply fixes
6. [ ] Show diff + approval
7. [ ] Server bootstrap (nginx/certbot/clone/seed)
8. [ ] Push → deploy → verify live + isolation intact
