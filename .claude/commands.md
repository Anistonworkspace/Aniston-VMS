# Commands Reference

## Session management
- `/start` — **Run this first in every new chat.** Loads full project context from `memory/`
- `/done` — **Run this before closing a chat.** Saves progress to `memory/`, releases locks

## Feature development
- `/new-module <name>` — Scaffold a complete new feature module (backend + frontend + DB)
- `/explain <target>` — Understand how any module, feature, or flow works (onboarding aid)
- `/trace <workflow>` — Full UI → DB → socket end-to-end workflow trace with gap detection
- `/migrate <description>` — Safe database migration creation with danger checks

## Quality and auditing
- `/health` — Verify the dev environment is running correctly
- `/audit` — Full 10-dimension enterprise audit (logic, security, performance, etc.)
- `/security-scan` — Security vulnerability scan (OWASP Top 10)
- `/optimize <target>` — Find and fix N+1 queries, missing indexes, slow renders
- `/add-tests <target>` — Write Vitest unit/integration tests + Playwright E2E tests

## Documentation
- `/document <target>` — Generate Swagger JSDoc + module README + ADR

## Bug fixing and releases
- `/fix-critical` — Fix a P0 or P1 critical bug with a safe plan
- `/release-check` — Pre-release quality gate
- `/deploy` — Deploy to production

---

## Available Agents

| Agent | What it does |
|-------|-------------|
| `agent-memory` | Loads/saves context at session start and end |
| `agent-planner` | Writes a plan before any non-trivial change |
| `agent-api-security` | RBAC, IDOR, validation audit for every API route |
| `agent-code-review` | Code review before commit |
| `agent-debugger` | Diagnose and fix environment errors |
| `agent-devops` | CI/CD, Docker, deploy script audit |
| `agent-docs` | Write and maintain documentation |
| `agent-frontend-wiring` | Dead UI, broken mutations, API mismatch |
| `agent-logic-analyzer` | Business logic bugs, race conditions |
| `agent-logic-creator` | DDD aggregates, domain modeling, sagas, business rules |
| `agent-observability` | Logging, health checks, audit trails |
| `agent-performance` | N+1 queries, missing indexes, slow endpoints |
| `agent-database` | Prisma schema, migrations, enum consistency |
| `agent-testing` | Test gap analysis and test strategy |
| `agent-refactor` | Remove code duplication |
| `agent-security` | Full security audit (OWASP Top 10) |
| `agent-test-writer` | Write Vitest unit tests and Playwright E2E tests |
| `agent-vms-uiux` | Mobile layout, PWA, accessibility audit |
| `agent-electron` | Electron desktop, IPC, auto-update, NSIS installer |

## IMPORTANT — No Worktrees
NEVER use isolation: "worktree". ALL changes must be made directly in the main working tree.
