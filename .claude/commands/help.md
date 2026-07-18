---
name: help
description: List every available slash command with one-line descriptions. Lifeline for new employees who don't yet know what's available.
---

# /help — Index of all slash commands

When invoked, read `.claude/commands/*.md` and print a table grouped by purpose.
Use the YAML frontmatter `description` field as the one-liner.

---

## Output format

```
## Available slash commands

### Daily workflow
- /start — Load all memory context before beginning work
- /done — Save progress, update memory, release locks
- /compact-save — Save compaction summary to memory after context compaction
- /health — Check that the dev environment is running correctly

### Build & ship features
- /new-module <name> — Scaffold a complete NestJS module (module/controller/service/DTO/Prisma model + RTK Query slice)
- /add-tests <target> — Write Vitest unit + Playwright E2E tests
- /document <target> — Write Swagger JSDoc + module README + ADR
- /optimize <target> — Find and fix performance issues
- /trace <workflow> — Trace a full UI → DB → socket workflow
- /explain <target> — Explain any module layer-by-layer

### Maintain quality
- /audit — Run all 10 audit dimensions across the codebase
- /security-scan — Run OWASP Top 10 audit
- /fix-critical <description> — Fix a P0/P1 bug with a proper plan
- /release-check — Pre-release quality gate

### Database & deploy
- /migrate <description> — Safe Prisma migration workflow (Region/Zone/Site/Camera schema)
- /deploy — Deploy to production via CI

### Context & tooling
- /graph <sub> — Query the codebase knowledge graph (Graphify or Node fallback)
- /graph-always — Toggle "Graphify-first" mode on/off
- /handoff — Save a portable context capsule before compacting/switching chats

### Bootstrap
- /project-init — Rewrite project identity when forking Aniston VMS for a new deployment/product

### Meta
- /help — This command — list every slash command
```

---

## Behavior

1. List `.claude/commands/*.md` (excluding `_template.md` if present).
2. For each command file, read the YAML frontmatter:
   - `name:` — derive the slash command name from the filename if missing
   - `description:` — use the first non-empty line under `description:` (single-line) or the first sentence of the first paragraph
3. Group commands into the buckets above based on filename heuristic; print any uncategorized commands under "Other".
4. Sort commands alphabetically within each group.

If a command file is missing frontmatter, fall back to the first markdown heading or the first non-blank line under the title.

---

## Rules that apply
- `.claude/rules/rule-memory-system.md` — /start and /done sequences are mandatory
