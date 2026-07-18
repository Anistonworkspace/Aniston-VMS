---
name: graph
description: Build or query the codebase knowledge graph. Uses the real Graphify (semantic graph + communities + graph.html) when installed, else a zero-dep Node fallback. Answers "what depends on this?" / "explain this" without grepping the whole repo.
---

# /graph — codebase knowledge graph

Query the graph instead of grepping many files — one query = a few tokens, and the
model gets real structural understanding.

There are two engines. This command prefers **Graphify** (richer) and falls back to the
built-in **Node tool** (no Python needed).

## Preferred: real Graphify (installed via `pip install graphifyy`)

For the full interactive experience, the global **`/graphify`** skill is installed
(`~/.claude/skills/graphify/`). Or drive it from this command:

```bash
python -m graphify update .          # build/refresh — 2600+ nodes, communities, graph.html, GRAPH_REPORT.md
python -m graphify explain "<name>"  # plain-language explanation of a node + neighbors
python -m graphify path "<A>" "<B>"  # shortest dependency path between two nodes
python -m graphify diagnose multigraph   # edge-collapse sanity check
```
- Output → `graphify-out/` (gitignored). Open `graphify-out/graph.html` for the visual map.
- Set `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) to add LLM semantic extraction on top of the
  Tree-sitter AST pass.
- Note: the CLI is `python -m graphify` (the `.exe` may not be on the Bash PATH).

## Fallback: built-in Node tool (zero deps, no Python)

Use when Python/Graphify isn't available, or for fast exact import edges:

```bash
node .claude/scripts/graph.mjs build
node .claude/scripts/graph.mjs deps <path>       # what <path> imports
node .claude/scripts/graph.mjs inbound <path>    # what imports <path> (blast radius)
node .claude/scripts/graph.mjs explain <path>
```
- `<path>` accepts partials (`logger` → `apps/api/src/common/logger.ts` per the target monorepo layout in
  `docs/06-implementation-plan.md`; currently `backend/src/lib/logger.ts` on the pre-migration scaffold).
  Output → `.claude/graph/`.

## Sub-command routing

| `/graph <sub>` | Graphify (preferred) | Node fallback |
|---|---|---|
| `build` | `python -m graphify update .` | `node .claude/scripts/graph.mjs build` |
| `explain <x>` | `python -m graphify explain "<x>"` | `... graph.mjs explain <x>` |
| `deps <path>` | (use `inbound`/`explain`) | `... graph.mjs deps <path>` |
| `inbound <path>` | `... graph.mjs inbound <path>` | `... graph.mjs inbound <path>` |
| `path <a> <b>` | `python -m graphify path "<a>" "<b>"` | — |

When invoked: try the Graphify command first; if `python -m graphify` fails
(not installed), run the Node equivalent and say which engine you used.

## When to use
- Before a refactor: `inbound <file>` / `path` = the real blast radius.
- During review: `explain <changed-file>` = its role + neighbors in one query.
- Onboarding: `python -m graphify update .` then open `graph.html`.

## Rules
- `graphify-out/` and `.claude/graph/` are gitignored (regenerable, never committed)
  — `rule-secrets-policy.md`.
- The graph is regeneratable state, not memory — don't save it to `memory/`
  (`rule-memory-system.md`).
