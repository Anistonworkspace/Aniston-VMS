# Reference Index — Project Docs, Agents, Skills, Rules

> Moved out of `CLAUDE.md` so it doesn't load into context on every message.
> The `on-prompt.sh` auto-dispatch hook surfaces the RELEVANT agents/skills/rules
> per prompt automatically — you rarely need this full catalog. Read it when you
> want the complete map.

---

## Aniston VMS project docs (authoritative — read before building)

| Doc | One-liner |
|---|---|
| `../CLAUDE.md` | Master prompt — how agents build Aniston VMS |
| `01-PRD.md` | Product requirements (users, features, success criteria) |
| `02-TRD.md` | Technical requirements (streaming, health, notifications, security) |
| `03-app-flow.md` | Screen-by-screen app flow |
| `04-uiux-brief.md` | UI/UX brief + design tokens direction |
| `05-backend-schema.md` | Full schema — tables, enums, indexes (ERD source of truth) |
| `06-implementation-plan.md` | Staged build plan (Stage 1 Foundation → hardening) |
| `actual-design.png` | Visual design reference |
| `architecture.md` · `database-erd.md` · `api-conventions.md` · `tech-stack-targets.md` | Working docs kept in sync with the plan docs |

---

## Agents (auto-triggered — you don't invoke these manually)

| Agent | Auto-triggers when... |
|-------|----------------------|
| `agent-memory` | Session starts or ends, picking up a handoff |
| `agent-planner` | Any change touching > 1 file or > 10 lines |
| `agent-api-security` | Any route/middleware/auth file changes |
| `agent-code-review` | Before any commit or merge |
| `agent-debugger` | TypeScript errors, test failures, server crash |
| `agent-devops` | CI/CD, Docker, deploy script changes |
| `agent-docs` | New module built, Swagger missing, README missing |
| `agent-frontend-wiring` | New page/component, mutations added |
| `agent-logic-analyzer` | New workflow, state machine, approval flow |
| `agent-logic-creator` | DDD aggregates, domain modeling, business rules, saga design |
| `agent-observability` | Logging gaps, health check issues |
| `agent-performance` | N+1 detected, pagination missing, bundle bloat |
| `agent-database` | Prisma schema changes, migrations |
| `agent-testing` | New module, coverage below threshold |
| `agent-refactor` | 3+ duplicate code blocks found |
| `agent-security` | `/security-scan`, auth changes, file uploads |
| `agent-test-writer` | `/add-tests`, new module with no tests |
| `agent-vms-uiux` | New page/component, mobile layout issues |
| `agent-electron` | Electron desktop, IPC handlers, auto-update, NSIS installer |
| `agent-system-designer` | 8-question interview → ADR + PRD + ERD. Blocks `/new-module` when no design exists |
| `agent-completion-loop` | Orchestrates `/build-loop` — test-first, iterate to green, wire-completeness gate. Cost-capped |

---

## Skills Reference (agents read these for code patterns)

### Core Architecture
| Skill file | Contains |
|-----------|---------|
| `skill-mvc-patterns.md` | Controller/service/guard/pagination templates |
| `skill-prisma-patterns.md` | org scoping, $transaction, optimistic lock, N+1 fix |
| `skill-rtk-query-patterns.md` | API slice, providesTags, invalidatesTags, cache |
| `skill-auth-patterns.md` | JWT flow, requirePermission, self-approval guard |
| `skill-state-machine-patterns.md` | updateMany lock, terminal states, transition table, domain events |
| `skill-domain-modeling-patterns.md` | DDD aggregates, value objects, bounded contexts, domain events, repositories |
| `skill-business-rules-patterns.md` | Specification pattern, Policy objects, rule tables, domain services |
| `skill-workflow-orchestration-patterns.md` | Sagas, outbox, process managers, idempotency, choreography |
| `skill-testing-patterns.md` | Service mocks, component tests, Playwright E2E |
| `skill-ui-ux-checklist.md` | Boilerplate Design System — all tokens, component primitives, animation timings, 24-section conformance checklist |

### Data & Communication
| Skill file | Contains |
|-----------|---------|
| `skill-socket-patterns.md` | Socket.io rooms, typed events, emit after transaction, RTK invalidation |
| `skill-background-jobs-patterns.md` | BullMQ queues, email/notification/export workers, retry/backoff |
| `skill-notification-patterns.md` | Notification model, socket real-time, unread count badge |
| `skill-caching-patterns.md` | Redis cache-aside, CacheKeys, TTL strategy, stampede prevention |
| `skill-webhook-patterns.md` | HMAC validation, outgoing retry, webhook log, event catalog |
| `skill-email-patterns.md` | Nodemailer SMTP, BullMQ email worker, welcome/reset/OTP HTML templates |

### Security & Compliance
| Skill file | Contains |
|-----------|---------|
| `skill-encryption-patterns.md` | AES-256-GCM, field encryption, safeDecrypt, key rotation |
| `skill-audit-log-patterns.md` | AuditLog model, before/after snapshots, REDACTED fields, timeline UI |
| `skill-rbac-advanced-patterns.md` | Permission registry, ownership guards, member scope, self-approval |
| `skill-input-sanitization-patterns.md` | DOMPurify XSS, file name sanitization, CSP headers, safe URLs |

### UI & Frontend
| Skill file | Contains |
|-----------|---------|
| `skill-form-patterns.md` | Create/edit forms, multi-step, field array, Zod cross-field |
| `skill-table-patterns.md` | DataTable, pagination, bulk action bar, mobile card fallback |
| `skill-modal-patterns.md` | Modal/drawer, delete confirm, edit form reset, portal |
| `skill-error-handling-patterns.md` | AppError hierarchy, Result types, circuit breakers, retry with jitter, dead-letter queues |
| `skill-keyboard-shortcuts-patterns.md` | useHotkeys, command palette, modal Escape, table arrow-key nav, focus trap |
| `skill-search-filter-patterns.md` | URL-synced filters, debounced search, scoped list query |
| `skill-chart-patterns.md` | Recharts line/bar/donut, KPI cards, date range picker, real-time |
| `skill-infinite-scroll-patterns.md` | Cursor pagination, IntersectionObserver, RTK Query merge, virtual list |

### Design & Planning
| Skill file | Contains |
|-----------|---------|
| `skill-system-design-patterns.md` | Templates for ADR / PRD / ERD, actors table, entities table, state machine spec, API contract, RBAC matrix, NFRs, out-of-scope section |
| `skill-ddd-bounded-contexts-patterns.md` | When to split into contexts, context map (Mermaid), ubiquitous language table, ACL pattern, cross-context domain events |
| `skill-codebase-graph-patterns.md` | Graphify — build/query codebase knowledge graph, dependency tracing, community detection |

### Completion & Test-Driven Build
| Skill file | Contains |
|-----------|---------|
| `skill-tdd-loop-patterns.md` | Test-first workflow: 4-scaffold templates (backend service, routes, frontend component, E2E), loop control, fail-fast rules, seedTestUser + signInAs helpers |
| `skill-wire-completeness-patterns.md` | 12-hop end-to-end trace (UI → mutation → route → controller → service → prisma → audit → socket → invalidate → toast → cleanup) with grep-based mechanical checks |

### Modern UI & Motion (reactbits-tier)
| Skill file | Contains |
|-----------|---------|
| `skill-modern-hero-patterns.md` | Spotlight hero, split-with-mockup, animated grid, gradient text, word rotator, trust bar, CTA card |
| `skill-modern-layout-patterns.md` | Bento grid, infinite marquee, sticky-scroll story, reveal-on-scroll, parallax, magnetic button, soft divider |
| `skill-modern-motion-patterns.md` | Spring presets, shared layout (magic move), stagger children, swipe card, animated numbers, scroll progress, tilt card |
| `skill-command-palette-patterns.md` | Cmd+K palette, recent-first ordering, async results, sub-menus, keyboard hints, command registry |
| `skill-drag-drop-patterns.md` | dnd-kit sortable, kanban board, file drop zone, multi-select drag, optimistic + rollback |
| `skill-empty-state-patterns.md` | Full-page empty, filter-empty, search-empty, table-body empty, error-empty, first-run tips, undo-after-clear |
| `skill-onboarding-flow-patterns.md` | URL-synced multi-step, progress dots, resume banner, driver.js tour, localStorage draft persistence |

### Operations & Platform
| Skill file | Contains |
|-----------|---------|
| `skill-file-upload-patterns.md` | Multer, MIME+ext validation, sharp resize, auth-gated static serve |
| `skill-report-export-patterns.md` | PDFKit, ExcelJS, binary download mutation, large export via BullMQ |
| `skill-bulk-operations-patterns.md` | CSV import, bulk update/delete, partial failure, BullMQ progress |
| `skill-pwa-patterns.md` | Workbox, offline, install prompt, push notifications, update prompt |
| `skill-monitoring-patterns.md` | Winston structured logs, request ID, Sentry, health check, PM2 |
| `skill-multitenancy-patterns.md` | Org onboarding, subdomain routing, per-tenant config, plan gating |
| `skill-capacitor-patterns.md` | Android/iOS build, FCM push, camera, deep links, safe area |
| `skill-electron-patterns.md` | IPC, auto-update, tray, file dialogs, NSIS installer |
| `skill-i18n-patterns.md` | i18next, locale, plurals, date/currency format, RTL |
| `skill-rate-limiting-patterns.md` | Redis-backed rate limit, account lockout, 429 frontend handling |
| `skill-ci-cd-patterns.md` | GitHub Actions CI/deploy/release workflows, PM2, EC2 SSH deploy |

---

## Rules Reference

| Rule file | Enforces |
|----------|---------|
| `rule-mvc-architecture.md` | 4-layer MVC pattern with code templates |
| `rule-backend.md` | Thin controllers, AppError, bcrypt, encryption |
| `rule-frontend.md` | RTK Query, React Hook Form, Tailwind only |
| `rule-api.md` | Response envelope, HTTP codes, pagination |
| `rule-security-rbac.md` | organizationId scoping, IDOR prevention, RBAC |
| `rule-database.md` | UUID IDs, soft delete, index requirements |
| `rule-database-migrations.md` | Production migration safety sequence |
| `rule-state-machines.md` | updateMany optimistic lock, terminal states |
| `rule-testing-standards.md` | 80%/70% coverage thresholds, RBAC matrix |
| `rule-logic-analysis.md` | 10-layer trace, enum completeness, side effects |
| `rule-audit-standards.md` | 10 audit dimensions, severity rubric |
| `rule-bug-fix-process.md` | P0–P3 fix plans with rollback |
| `rule-secrets-policy.md` | No .env commits, no APK in git |
| `rule-git-safety.md` | No force-push, no worktrees |
| `rule-memory-system.md` | Mandatory start/end sequences |
| `rule-naming-conventions.md` | camelCase/PascalCase/SCREAMING_SNAKE, file naming, route naming |
| `rule-logging-standards.md` | No console.log, structured JSON logs, requestId required, log levels |
| `rule-completion-standards.md` | Definition of DONE, 3-gate completion, cost caps for /build-loop |
