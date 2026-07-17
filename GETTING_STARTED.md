# Getting Started

> **Project note:** this repo now builds **Aniston VMS** (multi-tenant CCTV Video Management
> System). The steps below still apply — they set up the boilerplate dev environment (Postgres,
> Redis, workspaces) that Aniston VMS runs on. Read [`README.md`](README.md), [`CLAUDE.md`](CLAUDE.md)
> and `docs/01-PRD.md` … `docs/06-implementation-plan.md` first. Container/database names still say
> "boilerplate" until the compose files are renamed in a code stage.

This guide takes you from zero to a running development environment in under 10 minutes.

---

## One-Command Setup (Recommended)

The fastest way to get started. One command does everything: copies `.env`, generates secrets, starts Docker, installs dependencies, runs migrations, and seeds the database.

**macOS / Linux / WSL2:**
```bash
git clone <repo-url>
cd boilerplate-app
bash scripts/setup.sh
```

**Windows (PowerShell):**
```powershell
git clone <repo-url>
cd boilerplate-app
.\scripts\setup.ps1
```

Then start the app:
```bash
npm run dev
```

Open:
- **App** → http://localhost:5173
- **API docs** → http://localhost:4000/api/docs

Open VS Code, start a Claude chat, type `/start`. You're in god mode.

**That's it.** Everything below is the manual version for troubleshooting or advanced setups.

---

## Manual Setup (Advanced)

### Prerequisites

Install these before you start:

| Tool | Version | Install |
|------|---------|----------------|
| Node.js | 20+ | https://nodejs.org |
| npm | 10+ | comes with Node |
| Docker Desktop | latest | https://docker.com/products/docker-desktop |
| Git | any | https://git-scm.com |
| VS Code | any | https://code.visualstudio.com |
| Claude Code extension | latest | VS Code Extensions → search "Claude Code" |

---

## Step 1 — Clone and install

```bash
git clone <repo-url>
cd boilerplate-app
npm install
```

This installs all three workspaces (frontend, backend, shared) in one command.

---

## Step 2 — Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in these values:

```env
DATABASE_URL=postgresql://postgres:change_this_password_in_dev@localhost:5432/boilerplate_app
REDIS_URL=redis://localhost:6379
JWT_SECRET=<any random string, 32+ characters>
JWT_REFRESH_SECRET=<another random string, different from above>
ENCRYPTION_KEY=<64 hex characters — see below>
```

To generate ENCRYPTION_KEY (run in terminal):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Leave the rest of `.env` as-is for local development.

---

## Step 3 — Start Docker services

```bash
cd docker
cp .env.docker .env.docker   # it already has dev defaults, no changes needed
docker compose up -d
cd ..
```

This starts PostgreSQL 16 and Redis 7. Verify they are running:
```bash
docker ps
# You should see: boilerplate_postgres and boilerplate_redis
```

---

## Step 4 — Set up the database

```bash
npm run db:migrate    # creates tables from the Prisma schema
npm run db:seed       # creates demo org + 2 test users
```

Seed creates these users (all password: `Password123!`):
- `admin@example.com` — SUPER_ADMIN role
- `member@example.com` — MEMBER role

---

## Step 5 — Start development servers

```bash
npm run dev
```

This starts both backend and frontend. Open:
- **App** → http://localhost:5173
- **API docs** → http://localhost:4000/api/docs
- **Health check** → http://localhost:4000/api/health

---

## Step 6 — Set up Claude Code (god mode)

1. Install the Claude Code VS Code extension
2. Open the VS Code terminal
3. Start a new chat
4. Type `/start` and press Enter

Claude will read the `memory/` folder and instantly know:
- What features are already built
- What is pending
- What conventions the project follows
- What agents and commands are available

You are now in god mode. Claude knows the full project context.

---

## Troubleshooting

**`npm install` fails with workspace errors**
```bash
# Make sure you are in the root of the repo, not inside a subfolder
pwd  # should end with /boilerplate-app
npm install
```

**`docker compose up -d` fails with port conflict**
```bash
# Check what is using port 5432 or 6379
lsof -i :5432
lsof -i :6379
# Kill the conflicting process or change the port in docker-compose.yml
```

**TypeScript errors in VS Code after install**
```bash
# Restart TypeScript server
# VS Code: Cmd/Ctrl+Shift+P → "TypeScript: Restart TS Server"
# Or run:
npm run db:generate
```

**`npm run db:migrate` fails with "Can't reach database"**
- Make sure Docker is running: `docker ps`
- Make sure DATABASE_URL in `.env` matches the postgres password in `docker/.env.docker`

**Login says "Invalid credentials" after seed**
- Make sure seed ran successfully: `npm run db:seed`
- Use password `Password123!`

**Backend starts but frontend can't reach it (CORS error)**
- Make sure `FRONTEND_URL=http://localhost:5173` is in `.env`
- Make sure the backend is running on port 4000

---

## Project conventions

Before writing your first line of code, read these (5 minutes):
1. [.claude/rules/rule-api.md](.claude/rules/rule-api.md) — API response format
2. [.claude/rules/rule-backend.md](.claude/rules/rule-backend.md) — controller/service pattern
3. [.claude/rules/rule-frontend.md](.claude/rules/rule-frontend.md) — RTK Query, Tailwind, components
4. [.claude/rules/rule-security-rbac.md](.claude/rules/rule-security-rbac.md) — NEVER forget organizationId

Also read [CONTRIBUTING.md](CONTRIBUTING.md) before your first commit.

---

## Build your first feature

```bash
# In a Claude Code chat:
/start
/new-module invoice
```

This scaffolds: Prisma model, backend routes/controller/service/validation, frontend RTK Query + page, router wiring, sidebar nav, permissions — all following project conventions automatically.

---

## Daily workflow with Claude Code

```
Morning:
  Open VS Code → open Claude chat → /start

During work:
  Ask Claude to build features, fix bugs, run audits
  Claude always reads memory/ first and knows the full context

End of day:
  /done
  Claude saves all progress to memory/
  Tomorrow's /start picks up exactly here
```
