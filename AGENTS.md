# AGENTS.md — Agentic AI Guide

Read by all agentic AI tools (Claude Code, OpenAI Codex, GitHub Copilot Workspace, etc.) before starting any task.

---

## Identity

**Project:** Aniston VMS — CCTV monitoring platform for ~125 cameras across Delhi zones (5-stage camera health monitoring, RTSP/ONVIF probing, incident management with escalation, live view, snapshots + recordings, image-analysis, WhatsApp/email alerts).
**Org:** Aniston Technologies LLP
**Stack:** React 18 + Vite + TypeScript + Tailwind + RTK Query (frontend) | NestJS + Prisma + PostgreSQL + Redis + BullMQ workers + Socket.IO (apps/api + apps/workers) | MediaMTX (services/media) | FastAPI + OpenCV (services/image-analysis) | Capacitor (mobile) | Electron (desktop). Note: the current on-disk `backend/` is an Express scaffold being migrated to NestJS.
**Monorepo:** npm workspaces (`frontend/`, `backend/`, `shared/`)

---

## Mandatory start-of-work sequence

Do this before writing any code:

1. Read `memory/INDEX.md`
2. Read `memory/project-state.md`
3. Read `memory/coordination/locks.md` — if your target files are locked, coordinate via `memory/coordination/handoffs.md`
4. Skim `memory/coordination/shared-context.md`
5. Check `memory/coordination/handoffs.md` for OPEN handoffs
6. Check `memory/plans/_active/` — if a plan covers your task, continue it
7. Read relevant ADRs in `memory/decisions/`

Skip steps 1–7 ONLY for purely informational requests where no files will be modified.

---

## Mandatory end-of-work sequence

1. Update `memory/project-state.md`
2. Append to today's `memory/changes/YYYY-MM-DD-changes.md`
3. Release any file locks
4. If stopped partway → write handoff in `memory/coordination/handoffs.md`
5. If finished → move plan from `_active/` to `_archive/` with `-DONE` appended
6. Cross-agent learnings → append to `memory/coordination/shared-context.md`

---

## Binding rules

All rules in `.claude/rules/` are binding. Prefixed with `rule-` for easy identification:

| File | What it enforces |
|------|-----------------|
| `rule-mvc-architecture.md` | 4-layer MVC pattern with Controller/Service/Validation/Routes templates |
| `rule-api.md` | API response format, HTTP codes, rate limits, pagination |
| `rule-backend.md` | Controller/service pattern, middleware order, security |
| `rule-database.md` | Model conventions, UUID IDs, soft delete, indexes |
| `rule-frontend.md` | RTK Query only, Redux scope, forms, Tailwind only |
| `rule-security-rbac.md` | organizationId on every query, IDOR prevention |
| `rule-git-safety.md` | No push without approval, no worktrees, no force-push |
| `rule-secrets-policy.md` | What never goes in git, where secrets live |
| `rule-database-migrations.md` | Never db:push in production |
| `rule-state-machines.md` | Status transitions, terminal states, optimistic locks |
| `rule-testing-standards.md` | Coverage requirements, required test types |
| `rule-bug-fix-process.md` | P0/P1 fix process and fix plan format |
| `rule-audit-standards.md` | 10-dimension audit format and scoring |
| `rule-logic-analysis.md` | How to trace full UI → DB workflows |
| `rule-memory-system.md` | Mandatory memory system protocol |

---

## Key conventions (quick ref)

```
API envelope:
  Success → { success: true, data: {}, meta: { page, limit, total } }
  Error   → { success: false, error: { code: "NOT_FOUND", message: "..." } }

Prisma:
  Every query on org-scoped models → where: { organizationId: req.user.organizationId }
  Multi-table writes → prisma.$transaction(...)
  Soft delete filter → { deletedAt: null }

RTK Query:
  Every query → providesTags
  Every mutation → invalidatesTags
  NEVER raw fetch()

Brand:
  Primary color: indigo-600 (#4f46e5)
  Fonts: Sora (headings), DM Sans (body), JetBrains Mono (numbers/data)
  Glassmorphism: bg-white/60 backdrop-blur-md border border-white/30 shadow-glass

Security:
  bcrypt ≥ 12 rounds
  AES-256-GCM for sensitive fields (suffix Encrypted)
  JWT: 15min access (Authorization header) + 7d refresh (httpOnly cookie)
```

---

## Available agents (`.claude/agents/`)

Prefixed with `agent-` for easy identification:

| Agent file | What it does |
|-----------|-------------|
| `agent-memory.md` | Loads/saves context. Run at session start and end. |
| `agent-planner.md` | Writes a plan before any non-trivial change |
| `agent-api-security.md` | Audits every API route for RBAC, IDOR, validation |
| `agent-code-review.md` | Reviews code against project standards before commit |
| `agent-debugger.md` | Diagnoses and fixes environment and runtime errors |
| `agent-devops.md` | Audits CI/CD, Docker, deploy scripts, rollback plans |
| `agent-docs.md` | Writes and maintains documentation |
| `agent-frontend-wiring.md` | Finds dead buttons, broken modals, API mismatches |
| `agent-logic-analyzer.md` | Finds business logic bugs and race conditions |
| `agent-observability.md` | Audits logs, health checks, audit trails |
| `agent-performance.md` | Finds N+1 queries, missing indexes, slow endpoints |
| `agent-database.md` | Audits Prisma schema, migrations, enum sync |
| `agent-testing.md` | Identifies test gaps and builds test strategy |
| `agent-refactor.md` | Removes duplication without breaking behavior |
| `agent-security.md` | Full security audit (OWASP Top 10) |
| `agent-test-writer.md` | Writes actual Vitest + Playwright test files |
| `agent-vms-uiux.md` | Audits mobile layout, PWA, accessibility |

---

## Skills reference (`.claude/skills/`)

Agents read these files when writing code — pattern libraries, not slash commands.

| Skill file | Contains |
|-----------|---------|
| `skill-mvc-patterns.md` | Controller/service/guard/pagination/soft-delete code templates |
| `skill-prisma-patterns.md` | organizationId scoping, $transaction, optimistic lock, N+1 prevention |
| `skill-rtk-query-patterns.md` | Full API slice, providesTags/invalidatesTags tables, what NOT to do |
| `skill-auth-patterns.md` | JWT flow, req.user shape, requirePermission, self-approval, ownership scope (ownerId) |
| `skill-state-machine-patterns.md` | updateMany optimistic lock, terminal states, side effects |
| `skill-testing-patterns.md` | Service mocks, component tests, Playwright E2E structure |

---

## Available commands (`.claude/commands/`)

Type these as slash commands in Claude Code:

| Command | What it does |
|---------|-------------|
| `/start` | Load project context at the start of every chat |
| `/done` | Save progress at the end of every session |
| `/new-module <name>` | Scaffold a complete new feature module |
| `/explain <target>` | Understand how any module, feature, or flow works |
| `/trace <workflow>` | Full UI → DB → socket trace with gap detection |
| `/migrate <description>` | Safe database migration workflow with danger checks |
| `/health` | Check the dev environment is running correctly |
| `/audit` | Full 10-dimension enterprise audit |
| `/security-scan` | Security vulnerability scan (OWASP Top 10) |
| `/optimize <target>` | Find and fix N+1 queries, missing indexes, slow renders |
| `/add-tests <target>` | Write Vitest unit/integration + Playwright E2E tests |
| `/document <target>` | Generate Swagger JSDoc + module README + ADR |
| `/fix-critical` | Fix a P0/P1 bug with a safe plan |
| `/release-check` | Pre-release quality gate |
| `/deploy` | Deploy to production |

---

## File lock protocol

When editing shared files (auth, RBAC, Prisma schema, shared types, or > 3 files at once):
1. Write a lock entry to `memory/coordination/locks.md` BEFORE editing
2. Mark RELEASED when done
3. If your target files are locked → write a handoff instead

---

## What NOT to do

- NEVER commit `.env`, `.jks`, `.keystore`, `.apk`, `.aab`
- NEVER use `git worktree add` or `isolation: "worktree"`
- NEVER push or create PRs without explicit user approval
- NEVER run `prisma db push` in production
- NEVER use `organizationId` from request body — always from `req.user`
- NEVER use raw `fetch()` in frontend — always RTK Query hooks
- NEVER write a plan without a Rollback section and Test Plan

---

## Store release builds

```
Android APK + AAB:  pwsh store-releases/android/build-android.ps1
iOS IPA:            bash store-releases/ios/build-ios.sh          (macOS only)
Windows EXE:        pwsh store-releases/electron/build-electron.ps1
```

---

## Architecture documentation (`docs/`)

Read these before touching any cross-cutting concerns:

| File | Contents |
|------|---------|
| `docs/architecture.md` | Mermaid system diagram, request lifecycle, auth flow, queue architecture |
| `docs/database-erd.md` | Mermaid ERD of all Prisma models, constraints, new-model checklist |
| `docs/api-conventions.md` | Response envelope, HTTP codes, route naming, pagination, error codes |

## MCP server setup

See `.claude/mcp-recommended.md` for which MCP servers to install.  
Key ones: `@modelcontextprotocol/server-postgres` (direct DB queries) + `@modelcontextprotocol/server-github` (PR/issue access).

## Running the project

```bash
cd docker && docker compose up -d    # PostgreSQL + Redis
npm run dev:backend                  # Backend :4000
npm run dev:frontend                 # Frontend :5173
npm run dev                          # Both together
```
