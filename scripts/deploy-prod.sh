#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Aniston VMS — production deploy orchestration (runs ON the EC2 host).
#
# Invoked by .github/workflows/deploy.yml over SSH, AFTER the backend + frontend
# images have been built and pushed to GHCR. Idempotent: safe to re-run.
#
# Isolation: everything is scoped to the `aniston-vms` compose project. The only
# host-wide action is `docker image prune -f`, which removes ONLY dangling
# (untagged) layers — never another stack's tagged images, containers, volumes or
# networks. We deliberately never call `docker system prune`.
#
# Required env:
#   IMAGE_TAG            git SHA of this deploy (image tag to pull)
# Optional env:
#   APP_DIR              repo checkout on the host (default: $HOME/aniston-vms)
#   FRONTEND_HOST_PORT   loopback port the frontend is published on (default 8095)
# ─────────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail

APP_DIR="${APP_DIR:-$HOME/aniston-vms}"
COMPOSE_FILE="docker/docker-compose.prod.yml"
PROJECT="aniston-vms"
NETWORK="${PROJECT}_default"
IMAGE_TAG="${IMAGE_TAG:?IMAGE_TAG is required (git SHA of the deploy)}"
FRONTEND_HOST_PORT="${FRONTEND_HOST_PORT:-8095}"

cd "$APP_DIR"

echo "==> Deploying ${PROJECT} @ ${IMAGE_TAG} (frontend on 127.0.0.1:${FRONTEND_HOST_PORT})"

# .env is written by the workflow from the PROD_ENV_FILE secret. It supplies both
# the container runtime env (env_file) and the ${...} substitutions in the compose
# file, so `--env-file .env` is mandatory.
if [[ ! -f .env ]]; then
  echo "FATAL: ${APP_DIR}/.env is missing — the workflow writes it from PROD_ENV_FILE." >&2
  exit 1
fi

export IMAGE_TAG FRONTEND_HOST_PORT

compose() { docker compose --env-file .env -f "$COMPOSE_FILE" -p "$PROJECT" "$@"; }

wait_healthy() {
  # $1 = container name, $2 = friendly label
  local name="$1" label="$2" status
  for i in $(seq 1 45); do
    status="$(docker inspect -f '{{.State.Health.Status}}' "$name" 2>/dev/null || echo missing)"
    if [[ "$status" == "healthy" ]]; then
      echo "    ${label} healthy."
      return 0
    fi
    if [[ "$i" -eq 45 ]]; then
      echo "FATAL: ${label} (${name}) did not become healthy (last status: ${status})." >&2
      compose logs --tail=60 >&2 || true
      return 1
    fi
    sleep 2
  done
}

echo "==> Pulling images from GHCR"
compose pull

echo "==> Starting data tier (postgres + redis)"
compose up -d postgres redis
wait_healthy aniston_vms_postgres "postgres"
wait_healthy aniston_vms_redis "redis"

echo "==> Running database migrations (prisma migrate deploy)"
# Self-contained: `prisma migrate deploy` needs only prisma/schema.prisma, the
# committed prisma/migrations/ dir and DATABASE_URL. The runtime backend image
# omits the prisma CLI (devDependency), so run migrations in a throwaway
# node:20-alpine container joined to the app network (so it can resolve
# `postgres`). Nothing is installed on the host.
# `|| true` keeps the pipeline non-fatal under `set -Eeuo pipefail`: without it a
# missing DATABASE_URL makes grep exit 1, which aborts the script HERE and skips
# the friendly guard below.
DB_URL="$(grep -E '^DATABASE_URL=' .env | head -n1 | cut -d= -f2- || true)"
if [[ -z "$DB_URL" ]]; then
  echo "FATAL: DATABASE_URL not found in .env." >&2
  exit 1
fi
# Pass DATABASE_URL by NAME (value inherited from this shell), never as
# `-e VAR=value` — the latter puts the DB credential on the `docker run` argv,
# where any local user on this shared host could read it via `ps` / /proc during
# the migration window.
export DATABASE_URL="$DB_URL"
docker run --rm \
  --network "$NETWORK" \
  -v "$APP_DIR/prisma:/repo/prisma:ro" \
  -w /repo \
  -e DATABASE_URL \
  node:20-alpine \
  npx -y prisma@6.5.0 migrate deploy --schema=prisma/schema.prisma

echo "==> Starting application tier (mediamtx + backend + frontend)"
compose up -d
wait_healthy aniston_vms_backend "backend"

echo "==> Verifying edge (host loopback → frontend → backend /api/health)"
for i in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:${FRONTEND_HOST_PORT}/api/health" >/dev/null 2>&1; then
    echo "    Edge OK."
    break
  fi
  if [[ "$i" -eq 15 ]]; then
    echo "FATAL: edge health check failed on 127.0.0.1:${FRONTEND_HOST_PORT}." >&2
    exit 1
  fi
  sleep 2
done

echo "==> Pruning dangling images (isolation-safe: untagged layers only)"
docker image prune -f >/dev/null 2>&1 || true

echo "==> Deploy OK — ${PROJECT} @ ${IMAGE_TAG} is live behind vms.anistonav.com"
