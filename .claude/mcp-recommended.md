# MCP Server Catalog

Model Context Protocol servers give Claude Code structured tools (DB queries,
file system, browser control, doc lookup, design imports) instead of forcing
it to shell out for everything. This project ships a curated catalog of **12
servers** grouped by role.

**Auto-wired (4):** `filesystem`, `postgres`, `github`, `memory`. Pre-configured
in [`.claude/mcp.json`](./mcp.json) — freshers get them without extra setup.

**Opt-in (8):** documented here but not started by default. Add to
`.claude/mcp.json` when you need them.

**Verify what's running:** `claude mcp list`.

---

## Auto-wired core (4)

### 1. `filesystem` — no more read prompts

Removes the "allow Read(...)?" prompt for anything under the project root.

```jsonc
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "${workspaceFolder}"]
    }
  }
}
```

**When to use:** always. Zero downside.

---

### 2. `postgres` — direct database queries

Lets the model run `SELECT` / `EXPLAIN` against your dev DB without writing
Prisma code first.

```jsonc
{
  "postgres": {
    "command": "npx",
    "args": [
      "-y",
      "@modelcontextprotocol/server-postgres",
      "postgresql://postgres:postgres@localhost:5432/aniston_vms"
    ]
  }
}
```

**When to use:** "how many users have role=ADMIN?", "which orders are stuck?",
"show me the schema for `refresh_tokens`".

**Security caveat:** use a **read-only** DB user in production-shaped configs.
Never point this at a real production `DATABASE_URL` — it has full SQL access.

---

### 3. `github` — read PRs, issues, files across repos

Requires a Personal Access Token in `GITHUB_PERSONAL_ACCESS_TOKEN`.

```jsonc
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${env:GITHUB_TOKEN}" }
  }
}
```

**When to use:** "summarize the last 5 PRs", "check if issue #123 is fixed",
"fetch the CI logs from the failing run".

**Security caveat:** scope the PAT to only the repos this project needs.
`repo` + `read:issues` + `read:actions` is usually enough — no `admin:org`.

---

### 4. `memory` — persistent cross-session knowledge graph

Supplements the file-based `memory/` system. Good for facts that don't fit
plans/decisions/changes (nicknames, preferences, "always run X after Y").

```jsonc
{
  "memory": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-memory"]
  }
}
```

**When to use:** "remember I prefer 2-space indent", "the client's staging URL
is X". Don't use it for anything that belongs in `memory/decisions/*.md`.

---

## Opt-in — Web / Browser (2)

### 5. `playwright` — headless-browser control for E2E and verification

Lets the model open pages, click, type, screenshot, and read the console.
Central to the `/build-loop` and `/verify-wired` commands (Phase 5).

```jsonc
{
  "playwright": {
    "command": "npx",
    "args": ["-y", "@playwright/mcp"]
  }
}
```

**Prereqs:** `npm i -D @playwright/test` (already installed in Batch 2 of the
prior audit). Run `npx playwright install` once to fetch browser binaries.

**When to use:** "run the login flow and screenshot after step 3",
"verify the new dashboard renders without console errors", "test the popup
closes on Escape".

---

### 6. `browserbase` — cloud browsers (fallback / scale)

When you need a real browser without depending on the local `chrome`, or when
you need to run E2E in parallel across many sessions (`browserbase` handles
sessions server-side).

```jsonc
{
  "browserbase": {
    "command": "npx",
    "args": ["-y", "@browserbase/mcp"],
    "env": { "BROWSERBASE_API_KEY": "${env:BROWSERBASE_API_KEY}" }
  }
}
```

**When to use:** CI-shaped scenarios you want to prototype locally; scraping
sites that block headless-chrome.

**Cost caveat:** paid service. Don't leave it wired in a hot-reload dev loop.

---

## Opt-in — Docs / Research (3)

### 7. `context7` — versioned library documentation

Pulls actual current docs for a specific library version, not stale training
data. Essential when working with fast-moving libraries (RTK Query, Prisma,
Framer Motion, shadcn/ui).

```jsonc
{
  "context7": {
    "command": "npx",
    "args": ["-y", "@upstash/context7-mcp"]
  }
}
```

**When to use:** "what's the current API for `useHotkeys`?", "does Prisma 6
support this?", "fetch the Framer Motion `useScroll` docs".

---

### 8. `perplexity` — web research with citations

For questions the model can't answer from training. Returns cited sources.

```jsonc
{
  "perplexity": {
    "command": "npx",
    "args": ["-y", "@perplexity/mcp"],
    "env": { "PERPLEXITY_API_KEY": "${env:PERPLEXITY_API_KEY}" }
  }
}
```

**When to use:** "what's the latest Prisma migration issue on Postgres 16?",
"which OWASP top 10 items apply to WebSocket auth?".

**Cost caveat:** paid API. Set a budget.

---

### 9. `fetch` — generic URL scrape

Simplest possible: gimme the markdown of this URL.

```jsonc
{
  "fetch": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-fetch"]
  }
}
```

**When to use:** "read the changelog at https://…", "grab this Stack Overflow
answer". Free.

---

## Opt-in — UI / Design (2)

### 10. `shadcn-ui-mcp` — fetch shadcn/ui + Aceternity + Magic UI + reactbits components on demand

The model looks up a component name (`sheet`, `command`, `card-3d`, etc.),
returns the current TypeScript source you can paste. Keeps modern-UI skills
in this repo pointing at real, working code.

```jsonc
{
  "shadcn-ui-mcp": {
    "command": "npx",
    "args": ["-y", "@jpisnice/shadcn-ui-mcp-server"]
  }
}
```

**When to use:** "add a shadcn Sheet drawer here", "get the reactbits
GradientText component".

Pairs with the Phase-3 modern-UI skills.

---

### 11. `figma-mcp` — import from Figma

If your design team uses Figma, this reads frames, components, and design
tokens.

```jsonc
{
  "figma": {
    "command": "npx",
    "args": ["-y", "@figma/mcp"],
    "env": { "FIGMA_ACCESS_TOKEN": "${env:FIGMA_TOKEN}" }
  }
}
```

**When to use:** "port this frame from Figma to a page component", "extract
the design tokens from the current Figma file".

---

## Opt-in — Planning (1)

### 12. `sequential-thinking` — structured multi-step reasoning

Encourages the model to break big problems into sub-steps with checkpoints.
Central to `/design-first` (Phase 4).

```jsonc
{
  "sequential-thinking": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
  }
}
```

**When to use:** system design, migration planning, root-cause analysis of a
gnarly bug. Not for everyday CRUD scaffolding.

---

## How to add / remove

Edit [`.claude/mcp.json`](./mcp.json). Format:

```jsonc
{
  "mcpServers": {
    "<name>": {
      "command": "<binary>",
      "args": ["...", "..."],
      "env": { "KEY": "value" }
    }
  }
}
```

Restart Claude Code. Run `claude mcp list` — new servers appear.

To disable a server temporarily without deleting: prefix the name with `_`
(e.g., `"_perplexity": { ... }`).

---

## Cost & credential hygiene

- **Never commit API keys** — use `${env:VAR}` interpolation and set the env
  var in your shell profile or Windows user env vars.
- **Set spend limits** at the provider (Perplexity, Browserbase, Figma).
- **Read-only DB user for `postgres`** in any shared or staging DB.
- **Scope PATs narrowly.** `github` needs `repo` + `read:issues`, not `admin`.

---

## Managed-DB alternatives (informational)

If you want to skip local Docker for Postgres, use one of these instead of
the `postgres` MCP server pointed at `localhost`:

- **Neon** — serverless Postgres, generous free tier. Point the `postgres`
  MCP at your Neon connection string.
- **Supabase** — Postgres + Auth + Storage. Also has an official MCP server
  (`@supabase/mcp`) that adds row-level-security awareness.

Either drops in without changing Aniston VMS's Prisma layer.

---

## Diagnostic tips

- `claude mcp list` — currently connected servers.
- `claude mcp logs <name>` — tail the server's stderr.
- If a server is "stuck starting", try `npx clear-npx-cache` and restart.
- If `postgres` shows up as failed → check `DATABASE_URL` and that Docker Postgres is up (`npm run docker:dev`).
