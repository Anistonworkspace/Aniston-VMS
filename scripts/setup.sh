#!/bin/bash
# One-command local setup for boilerplate-app
# Usage: bash scripts/setup.sh
# Tested on: macOS, Ubuntu, WSL2

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✔${NC}  $1"; }
info() { echo -e "${CYAN}→${NC}  $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
fail() { echo -e "${RED}✗${NC}  $1"; exit 1; }

echo ""
echo "  Boilerplate App — One-Command Setup"
echo "  ======================================"
echo ""

# ── Prerequisites check ─────────────────────────────────────────────────────
info "Checking prerequisites..."
command -v node   &>/dev/null || fail "Node.js not found. Install from https://nodejs.org (v20+)"
command -v docker &>/dev/null || fail "Docker not found. Install from https://docker.com/products/docker-desktop"
command -v npm    &>/dev/null || fail "npm not found (should come with Node.js)"

NODE_VERSION=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")
[ "$NODE_VERSION" -ge 20 ] || fail "Node.js v20+ required (found v${NODE_VERSION})"
ok "Node.js v$(node -e "process.stdout.write(process.version.slice(1))")"
ok "Docker $(docker --version | grep -oP '\d+\.\d+\.\d+' | head -1)"

# ── Docker running? ──────────────────────────────────────────────────────────
docker info &>/dev/null || fail "Docker daemon is not running. Start Docker Desktop and try again."
ok "Docker daemon is running"

# ── .env setup ──────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  info "Creating .env from .env.example..."
  cp .env.example .env

  info "Generating secrets..."
  JWT_SECRET=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")
  JWT_REFRESH=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")
  ENC_KEY=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")

  # Replace placeholders (works on both macOS and Linux)
  sed -i.bak "s|JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" .env
  sed -i.bak "s|JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=${JWT_REFRESH}|" .env
  sed -i.bak "s|ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${ENC_KEY}|" .env
  rm -f .env.bak
  ok ".env created with generated secrets"
else
  ok ".env already exists — skipping"
fi

# ── Start Docker services ────────────────────────────────────────────────────
info "Starting PostgreSQL + Redis..."
cd docker
docker compose -f docker-compose.yml up -d
cd ..

info "Waiting for PostgreSQL to be ready..."
MAX_WAIT=30; WAITED=0
until docker exec boilerplate_postgres pg_isready -U postgres &>/dev/null; do
  sleep 1; WAITED=$((WAITED+1))
  [ $WAITED -ge $MAX_WAIT ] && fail "PostgreSQL did not start in ${MAX_WAIT}s"
done
ok "PostgreSQL is ready"

until docker exec boilerplate_redis redis-cli ping &>/dev/null; do
  sleep 1
done
ok "Redis is ready"

# ── Claude Code hooks — ensure executable ────────────────────────────────────
info "Making Claude Code hooks executable..."
chmod +x .claude/hooks/*.sh 2>/dev/null || true
ok "Hooks are executable"

# ── npm install ──────────────────────────────────────────────────────────────
info "Installing npm dependencies..."
npm install --silent
ok "Dependencies installed"

# ── Database setup ───────────────────────────────────────────────────────────
info "Running Prisma migrations..."
npm run db:generate --silent
npm run db:push --silent
ok "Database schema applied"

info "Seeding database..."
npm run db:seed
ok "Database seeded (admin@example.com / manager@example.com / employee@example.com — password: Password123!)"

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}  Setup complete!${NC}"
echo ""
echo "  Run the app:"
echo "    npm run dev"
echo ""
echo "  URLs:"
echo "    App             → http://localhost:5173"
echo "    API docs        → http://localhost:4000/api/docs"
echo "    Health check    → http://localhost:4000/api/health"
echo "    Prisma Studio   → npm run db:studio"
echo ""
echo "  Claude Code:"
echo "    Open VS Code → open a Claude chat → type /start"
echo ""
