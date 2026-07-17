<!-- ═══════════════════════════════════════════════════════════════════════
     MANDATORY — READ BEFORE EVERY RESPONSE
     ═══════════════════════════════════════════════════════════════════════

  AUTO-DISPATCH: Before writing any code, check the task type and apply the
  matching agent(s) and skill(s) below. Do NOT wait for the user to name an
  agent — apply them automatically based on the task.

  | Task type                           | Apply agent(s)                        | Read skill(s)                    |
  |-------------------------------------|---------------------------------------|----------------------------------|
  | UI / component / page / design      | agent-ui-ux → agent-frontend-wiring   | skill-ui-ux-checklist.md         |
  | New module / scaffold / CRUD        | agent-planner → agent-code-review     | skill-mvc-patterns.md            |
  | Bug / error / crash / fix           | agent-debugger → agent-logic-analyzer | —                                |
  | Test / spec / coverage              | agent-testing → agent-test-writer     | skill-testing-patterns.md        |
  | Security / auth / RBAC / JWT        | agent-api-security → agent-security   | skill-auth-patterns.md           |
  | Database / migration / Prisma       | agent-database                        | skill-prisma-patterns.md         |
  | Deploy / CI / Docker / release      | agent-devops                          | —                                |
  | Performance / N+1 / paginate        | agent-performance                     | skill-prisma-patterns.md         |
  | Workflow / state machine / approval | agent-logic-analyzer                  | skill-state-machine-patterns.md  |
  | Code review / audit                 | agent-code-review                     | (all relevant skills)            |

  CORE RULES (always, no exceptions):
  1. MVC: Controller thin → Service thick → Prisma model (rule-mvc-architecture.md)
  2. Every Prisma query: organizationId + deletedAt:null (rule-security-rbac.md)
  3. Every API response: { success, data, meta } envelope (rule-api.md)
  4. No hardcoded hex colors — CSS variables only (skill-ui-ux-checklist.md)
  5. No .env commits, no APK in git, no secrets in code (rule-secrets-policy.md)

  CONTEXT RECOVERY: If this conversation starts with a compaction summary,
  run /compact-save IMMEDIATELY to save it to memory/sessions/compact/.
  Then run /start to reload full project state.
═══════════════════════════════════════════════════════════════════════════ -->

# Boilerplate App — AI Agent Entry Point

> **For freshers:** You don't need to read every file. Just describe what you want to build and the agents handle everything. Start with `/start`, then ask for what you need.

---

## What is this project?

A **generic AI-agent boilerplate** by **Aniston Technologies LLP**. It ships **no
application code** — the value is the AI-agent layer (`.claude/` agents, skills,
rules, commands, hooks), the memory system, the token-saving proxy, and the build
tooling for five targets (web, PWA, Android APK/AAB, iOS IPA, desktop EXE).

You start every project from this skeleton and the agents build the actual code
cheaply. Backend is a health-check-only Express app; the Prisma schema ships with
zero models; the frontend renders one placeholder page. Everything else — auth,
your data models, your API, your screens — you build with `/design-first` then
`/build-loop <module>`.

See [`docs/tech-stack-targets.md`](docs/tech-stack-targets.md) for the current
best tech per build target.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS v3 + shadcn/ui |
| State | Redux Toolkit + RTK Query |
| Animations | Framer Motion |
| Backend | Node.js + Express + TypeScript + Prisma ORM |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis 7 + BullMQ |
| Real-time | Socket.io |
| Mobile | Capacitor (Android APK/AAB + iOS IPA) |
| Desktop | Electron (Windows EXE) |
| Infra | Docker Compose + GitHub Actions + Nginx + PM2 |
| Testing | Vitest (unit/integration) + Playwright (E2E) |
| PWA | Workbox `injectManifest` strategy |

---

## CRITICAL RULES — Read These First

### 1. MVC Architecture is Mandatory
Every feature MUST follow the 4-layer pattern. See `.claude/rules/rule-mvc-architecture.md`.

```
Model     → prisma/schema.prisma          (data shape)
View      → frontend/src/features/<name>/ (React + RTK Query)
Controller→ backend/src/modules/<name>/<name>.controller.ts  (thin — parse, call, respond)
Service   → backend/src/modules/<name>/<name>.service.ts     (ALL business logic here)
```

### 2. Multi-Tenancy is Non-Negotiable
Every Prisma query on org-scoped data MUST include `organizationId: req.user.organizationId`.
The `organizationId` MUST come from the auth middleware — never from `req.body`.

### 3. No Git Worktrees
**NEVER use `isolation: "worktree"` or `git worktree add`.** All agents work in the main tree.

### 4. No Pushing Without Approval
**NEVER push code, create PRs, or deploy without explicit user approval.**

### 5. Use the Memory System
Every session: run `/start` first → work → run `/done` last. See `memory/INDEX.md`.

### 6. Setup Doctor gates every build
The first prompt each day auto-runs `.claude/hooks/doctor.sh`. If required AI tools
(Node, Python, Graphify, `/graphify` skill, fresh graph, handoff wiring) are missing,
Claude auto-fixes what it can and tells the user the rest — and **`/build-loop` and
`/new-module` refuse to run until `/doctor` is green** (hard gate). New machine? See
[`docs/NEW-MACHINE-SETUP.md`](docs/NEW-MACHINE-SETUP.md) or run `npm run setup:ai`.

### 7. Finish to production — never stop half-way
**Production-complete, or explicitly BLOCKED — never "mostly done".** No stubs, no
`TODO`/`FIXME`, no unwired mutations, no failing `typecheck`/`lint`. The completion
Stop-gate (`.claude/hooks/on-stop.sh`) blocks stopping until the work is clean.
See `.claude/rules/rule-completion-standards.md` → Definition of DONE. Long chat about
to compact? Run `/handoff` to save a portable context capsule.

---

## How to Run

```bash
cd docker && docker compose up -d    # Start PostgreSQL + Redis
npm run dev:backend                  # Backend on :4000
npm run dev:frontend                 # Frontend on :5173
npm run dev                          # Both together
```

Key URLs:
- Frontend: http://localhost:5173
- Backend API: http://localhost:4000
- Swagger Docs: http://localhost:4000/api/docs
- Health check: http://localhost:4000/api/health
- Prisma Studio: `npm run db:studio`

---

## Slash Commands (type these in Claude Code)

| Command | What it does |
|---------|-------------|
| `/start` | Load all memory context before beginning work |
| `/done` | Save progress, update memory, release locks |
| `/compact-save` | Save compaction summary to memory (run immediately after context compaction) |
| `/health` | Check the dev environment — services, env vars, DB connectivity, tooling |
| `/new-module <name>` | Scaffold a complete MVC module (backend + frontend + tests) |
| `/audit` | Run all 10 audit dimensions across the entire codebase |
| `/trace <workflow>` | Trace a full UI → DB → socket workflow and find gaps |
| `/add-tests <target>` | Write real Vitest unit + Playwright E2E tests |
| `/explain <target>` | Explain any module layer-by-layer |
| `/optimize <target>` | Fix N+1 queries, missing indexes, slow renders |
| `/migrate <description>` | Run a safe database migration workflow |
| `/document <target>` | Write Swagger JSDoc + module README + ADR |
| `/security-scan` | Run OWASP Top 10 audit |
| `/release-check` | Final gate before any production deploy |
| `/fix-critical <description>` | Fix a P0/P1 bug using the safe fix process (plan → fix → verify) |
| `/deploy` | Deploy to production — pre-deploy checks, build, migrate, PM2 reload |
| `/project-init` | Rename boilerplate for a new project — updates CLAUDE.md, package names, PWA manifest |
| `/help` | List every available slash command — your lifeline as a new team member |
| `/proxy-start` | Start the pxpipe token-compression proxy (cuts Claude Code bill 60–70%). See `.claude/proxy-recommended.md` |
| `/proxy-status` | Report pxpipe proxy health + tokens saved this session |
| `/graph <sub>` | Build/query the codebase knowledge graph via Graphify. Sub: `build`, `deps <symbol>`, `explain <path>`, `community <topic>`, `inbound <symbol>` |
| `/design-first <name> "<desc>"` | Interview-driven system design BEFORE any code — produces ADR + PRD + ERD. Run FIRST on every new project |
| `/design-review [ADR-N]` | Adversarial review of the latest system-design ADR against correctness/security/RBAC. Blocks build if CRITICAL findings |
| `/build-loop <name> "<spec>"` | Test-first, loop-until-green feature scaffolder. Guarantees fully-wired feature or clean stop with last-mile diff. Cost-capped |
| `/verify-wired <name>` | 12-hop end-to-end trace of a module (UI → mutation → route → controller → service → audit → socket → invalidate → toast). Blocks merge on any missing hop |

---

## Agents · Skills · Rules — full catalog

The complete tables (21 agents, 55 skills, 18 rules) live in
[`docs/reference-index.md`](docs/reference-index.md) so they do not load into context
on every message. The `on-prompt.sh` auto-dispatch hook surfaces the RELEVANT
agents/skills/rules per prompt automatically. Run `/help` for the command list.

---

## Database Commands

```bash
npm run db:generate    # Regenerate Prisma client (run after any schema change)
npm run db:push        # Push schema to DB — DEV ONLY, never production
npm run db:migrate     # Create a named migration file
npm run db:seed        # Seed with sample data
npm run db:studio      # Open Prisma Studio GUI at http://localhost:5555
```

---

## Architecture Docs

- `docs/architecture.md` — System diagram, request lifecycle, auth flow, queue architecture
- `docs/database-erd.md` — Entity relationship diagram for all Prisma models
- `docs/api-conventions.md` — Response envelope, HTTP codes, route naming, pagination

## MCP servers & proxy layer

- `.claude/mcp.json` — 4 auto-wired servers (filesystem, postgres, github, memory)
- `.claude/mcp-recommended.md` — 12-server curated catalog with 8 opt-in servers (playwright, browserbase, context7, perplexity, fetch, shadcn-ui-mcp, figma, sequential-thinking)
- `.claude/proxy-recommended.md` — pxpipe cost-cutting proxy (default) — see `/proxy-start`
- `docs/upgrade-to-headroom.md` — upgrade path from pxpipe to Headroom (deeper compression)

---

## Memory System

All persistent context lives in `memory/`. Every AI agent uses it.

```
memory/
  INDEX.md                    ← Start here — index of all memory
  project-state.md            ← Current state of the project
  decisions/                  ← Architecture Decision Records (ADRs)
  plans/_active/              ← In-progress implementation plans
  plans/_archive/             ← Completed plans
  changes/                    ← Daily change logs
  coordination/               ← locks.md, handoffs.md, shared-context.md
  prompts/                    ← Reusable prompt templates
```

---

## Fresher Quick Start

1. Open VS Code in this directory
2. Install recommended extensions (VS Code will prompt you)
3. Copy `.env.example` to `.env` and fill in your values
4. Run `cd docker && docker compose up -d`
5. Run `npm install` in the root
6. Run `npm run db:generate && npm run db:push && npm run db:seed`
7. Run `npm run dev`
8. Open Claude Code, type `/start`
9. Tell Claude what feature you want to build

**That's it. The agents do the rest.**

---

## Production Safety

- **NEVER** `db:push` in production → use `npx prisma migrate deploy`
- **NEVER** commit `.env` files → use `.env.example` with placeholder values
- **NEVER** commit APK/AAB/IPA/EXE artifacts → CI builds and deploys them
- **ALWAYS** backup the database before any migration
- **ALWAYS** run migrations BEFORE deploying new code
