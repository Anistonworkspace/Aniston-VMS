---
name: design-first
description: Interview-driven system design BEFORE any code. Produces ADR + PRD + ERD. Run this FIRST on every new project — the /new-module and /build-loop commands depend on the ADR existing.
---

# /design-first — System design before any code

Runs `agent-system-designer` (see [.claude/agents/agent-system-designer.md](../agents/agent-system-designer.md))
through an 8-question interview and produces three files:

- `memory/decisions/ADR-NNNN-system-design-<slug>.md` — the authoritative
  design document
- `docs/prd-<slug>.md` — human-readable product requirements
- `docs/erd-<slug>.md` — Mermaid entity-relationship diagram

Skills read: `skill-system-design-patterns.md`, `skill-ddd-bounded-contexts-patterns.md`.

---

## Usage

```
/design-first <ProjectName> "<one-line description>"
```

Examples:

- `/design-first FleetWatch "RTSP/ONVIF health monitoring for a logistics fleet's dash-cams"`
- `/design-first SiteGuard "multi-site CCTV health monitoring and incident escalation for facilities teams"`
- `/design-first` — asks for the name and description via AskUserQuestion if not provided

---

## Flow

The agent walks 8 questions, ONE at a time (via `AskUserQuestion`):

1. **Product identity** — expand the one-liner
2. **Actors and roles** — who uses this? each role's primary action
3. **Core entities** — the 3-7 nouns your app operates on, with scope (org/user/global)
4. **Core workflows** — 3-5 main flows; any approvals or multi-step processes
5. **API surface** — REST / WebSocket / GraphQL / webhooks
6. **Screens** — 5-15 rough labels
7. **Non-functional requirements** — users, latency, uptime, compliance, offline, payments, search
8. **Explicitly out of scope for v1** — the most important question

After all 8, the agent writes the three documents.

---

## What happens automatically

- **ADR file numbered correctly** — reads existing `memory/decisions/` for the
  next unused `ADR-NNNN`.
- **Slug derived from ProjectName** — kebab-case, ASCII-only.
- **Cross-references between files** — the ADR links to the PRD and ERD; the
  PRD names the ADR.
- **`memory/project-state.md` frontmatter updated** — `project_name`,
  `project_slug`, `domain`, `target_platforms`, `primary_roles`, `status:
  designed` (per Q1-Q7 answers).
- **`CLAUDE.md` header updated** — the template's placeholder project title →
  `<ProjectName>` in the title and description paragraph (same rename as
  `/project-init`).
- **New screens stay visually consistent** — Q6 screen labels should map
  onto the established soft-SaaS visual language already defined in
  `docs/04-uiux-brief.md` / `docs/actual-design.png` (rounded white cards,
  slate sidebar, status-pill semantics) rather than inventing a new design
  system for the feature.
- **`.claude/mcp.json` extended** if Q7 answers demand — e.g. payments = add
  a Stripe MCP; search over content = add context7 for docs; etc.

---

## Output to the user

After the design is captured:

```
## Design captured

Files written:
- memory/decisions/ADR-0009-system-design-fleetwatch.md
- docs/prd-fleetwatch.md
- docs/erd-fleetwatch.md

Next steps:
1. /design-review — cross-check the design against correctness, security, and RBAC gaps
2. /build-loop <first-module> — scaffold the first feature (loops until tests green)

Design score: <X>/10
```

---

## Rules the agent enforces

- **No design longer than 3 pages per document.** Long specs rot.
- **Every entity has explicit scope** (org / user / global).
- **Every state machine has terminal states named.**
- **Every permission uses 2-arg `requirePermission(resource, action)` form** —
  matches `packages/shared/src/permissions.ts` shape.
- **NFRs are numeric** — "100 concurrent users at launch", not "many users".
- **`Explicitly out of scope for v1` section is non-empty.**

---

## When to use

- **Every new project.** Non-negotiable.
- **Major pivots** where the entity set shifts substantially.
- **Before hiring a fresher onto the codebase** — the ADR is their onboarding
  document.

## When NOT to use

- **Adding a single module to an existing designed app** — use `/new-module`
  or `/build-loop` instead.
- **Prototyping a throwaway** — but note: even 30 min of design catches
  fundamental mismatches.

---

## Interaction with other commands

- `/new-module <name>` — before scaffolding, checks for an active
  `ADR-*-system-design-*.md`. If absent, prompts you to run `/design-first`
  first.
- `/build-loop <name>` — same check, hard requirement. No design → no build
  loop.
- `/design-review` — takes the latest design ADR and runs adversarial review
  (agent-code-review + agent-logic-analyzer + agent-security).
- `/project-init` — subset of `/design-first` (renaming only, no interview).
  If you ran `/project-init`, still run `/design-first` before any code.

---

## Rules to enforce

- `.claude/rules/rule-memory-system.md` — ADR file MUST land in
  `memory/decisions/` per the naming convention
- `.claude/rules/rule-mvc-architecture.md` — the design's API contract must
  fit the middleware chain
- `.claude/rules/rule-security-rbac.md` — the RBAC matrix constrains the
  permission registry
