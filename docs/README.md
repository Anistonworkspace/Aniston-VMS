# Documentation — Aniston VMS

## Plan docs (authoritative — read first, do not edit)

| Doc | One-liner |
|---|---|
| [`01-PRD.md`](01-PRD.md) | Product requirements — what Aniston VMS is, users, features, success criteria |
| [`02-TRD.md`](02-TRD.md) | Technical requirements — architecture, streaming/health/notification design, security |
| [`03-app-flow.md`](03-app-flow.md) | Screen-by-screen app flow (dashboards, live wall, playback, incidents, reports) |
| [`04-uiux-brief.md`](04-uiux-brief.md) | UI/UX brief — design tokens, layout, component direction |
| [`05-backend-schema.md`](05-backend-schema.md) | Backend schema — every table, enum, index (source of truth for the ERD) |
| [`06-implementation-plan.md`](06-implementation-plan.md) | Staged build plan (Stage 1 Foundation → hardening), working agreement |
| [`design-reference.jpeg`](design-reference.jpeg) | Visual design reference for the UI |

Master prompt for AI agents: [`../CLAUDE.md`](../CLAUDE.md).

## Working docs (kept in sync with the plan docs)

- [`architecture.md`](architecture.md) — system architecture: streaming path, health-check pipeline, notification pipeline
- [`api-conventions.md`](api-conventions.md) — response envelope, auth/JWT refresh, pagination, error codes
- [`database-erd.md`](database-erd.md) — ERD summary generated from `05-backend-schema.md`
- [`tech-stack-targets.md`](tech-stack-targets.md) — versions and build targets
- [`reference-index.md`](reference-index.md) — full catalog of harness agents/skills/rules + project doc index

## Harness / ops docs

- [`NEW-MACHINE-SETUP.md`](NEW-MACHINE-SETUP.md) — dev machine setup runbook
- [`claude-code-master-prompt.md`](claude-code-master-prompt.md) — SOP/reference for the Claude Code master prompt
- [`upgrade-to-headroom.md`](upgrade-to-headroom.md) — harness upgrade notes
- `security-audit-YYYY-MM-DD.md` — audit reports produced by `/run-security-audit` (as generated)

For day-to-day harness reference, see [`../.claude/GUIDE.md`](../.claude/GUIDE.md).
