# Plan: Make the agents "Fable-grade" — persist to production, spend fewer tokens, never lose context

**Created:** 2026-07-08
**Owner agent:** claude (main loop)
**Status:** active — APPROVED 2026-07-08, implementing

## Decisions locked by user
1. Persistence: **Hard Stop-gate** — block stopping on incomplete work (3-retry cap + /stop-anyway escape).
2. Tokens: **pxpipe + dispatch top-3 + slim CLAUDE.md + activate Graphify** (all of it).
3. Capsule: **Auto (PreCompact + Stop hook) + manual /handoff + /resume**.
4. Graphify: **Install + build + wire for real now.**

---

## What you asked for (5 things)

1. **Opus 4.8 should behave like Fable** — keep building until the functionality is
   *production-complete*, not stop half-way with stubs/TODOs/unwired features.
2. **Every prompt should spend fewer tokens.**
3. **A per-chat "context capsule" MD file** that captures what the chat is working on +
   which files matter, so pasting it into a NEW chat restores full context WITHOUT the new
   chat re-reading/searching every file. Survives context compaction.
4. **Confirm pxpipe / Graphify / Headroom status** (answer: all scaffolded, none activated).
5. **This plan + how to USE each thing after it's built** — then wait for approval.

---

## Current status of the 3 tools (honest)

| Tool | What exists now (uncommitted) | Actually working? |
|---|---|---|
| **pxpipe** | `/proxy-start`, `/proxy-status`, `.claude/proxy-recommended.md` | ❌ Not installed/tested. Command runs `npx pxpipe-proxy` on demand but never verified |
| **Graphify** | `/graph` command, `skill-codebase-graph-patterns.md` | ❌ Not installed. No graph ever built. `/graph` subcommands not wired to a real CLI |
| **Headroom** | `docs/upgrade-to-headroom.md`, catalog entry in `mcp-recommended.md` | ❌ Doc only. Not wired |

So: **integration points are drafted, but nothing is live.** This plan makes them live.

---

## Workstream A — Fable-grade persistence (finish to production, don't stop early)

**Root problem:** Opus 4.8 can declare "done" while code has stubs/TODOs, failing typecheck,
or unwired mutations. Fable pushes until it's actually done. We close the gap with a hard gate.

### A1. Completion-enforcing Stop hook (the strongest lever)
- Enhance `.claude/hooks/on-stop.sh` so that, when there are uncommitted **code** changes, it:
  1. Runs `npm run typecheck` (fast) — if it fails → **block the stop** and tell Claude to fix it.
  2. Greps the git diff for incompleteness markers: `TODO`, `FIXME`, `XXX`,
     `throw new Error('not implemented')`, `// stub`, `// placeholder`, empty `{}` bodies,
     newly-added `any`, `console.log` in backend.
  3. If a module folder was touched → check the `/verify-wired` markers
     (mutation has `invalidatesTags`, route has `requirePermission`, service has `$transaction` + audit).
  4. If any found → exit with a **block decision** + a reason ("N incompletes: fix before stopping").
     Claude Code feeds that back and the model keeps going.
- **Guards so it can't loop forever:** only fires on code changes (not conversation); a
  `.claude/logs/.stop-attempts` counter caps re-prompts at 3; an escape hatch
  `ALLOW_INCOMPLETE=1` or a `/stop-anyway` marker lets you force-stop.

### A2. Hard "Definition of Done" in rule-completion-standards.md + CLAUDE.md
- One binding paragraph: "NEVER declare done with stubs, TODOs, unwired mutations, failing
  typecheck/lint/tests, or a `/verify-wired` error. Production-complete or explicitly BLOCKED —
  never 'mostly done'."
- Injected into every session via CLAUDE.md so it's always in context.

### A3. Persistence directive in the building agents
- Add to `agent-completion-loop`, `agent-planner`, `agent-test-writer`, `agent-frontend-wiring`:
  "Continue until production-complete. Do not summarize partial work as finished. If blocked,
  say BLOCKED and why — do not silently stop."

### A4. Make `/build-loop` the default path for feature work
- CLAUDE.md + `/new-module` point users to `/build-loop` (test-first, loop-until-green,
  verify-wired) as the recommended way to build — that IS the Fable-like loop.

**How you'll use it:** you just build normally. The Stop hook won't let Claude stop on a
half-built feature — it auto-continues until typecheck is clean, no stubs remain, and wiring
is complete. You can override with `/stop-anyway` if you deliberately want a partial stop.

---

## Workstream B — Fewer tokens per prompt

### B1. Activate pxpipe (biggest single lever, 60–70%)
- Verify `npx pxpipe-proxy` boots on `127.0.0.1:47821`.
- Document the persistent Windows env var (`ANTHROPIC_BASE_URL`) so it's always on.
- Confirm savings in the dashboard + `~/.pxpipe/events.jsonl`.

### B2. Tighten the auto-dispatch (on-prompt.sh)
- Cap injected skills to the **top 3 most relevant** per prompt (today it can inject 5–9).
- Add a relevance rank so a "add a popup" prompt loads `skill-modal-patterns` only, not 5 UI skills.
- Result: less skill text loaded into context per prompt.

### B3. Slim CLAUDE.md (loaded on every message)
- Move the big Skills/Agents/Rules reference tables into a `docs/reference-index.md` that agents
  read on demand; keep CLAUDE.md to the essentials (~40% smaller). Saves tokens every single message.

### B4. Skill summaries (lazy load)
- Add a 1-line summary at the top of each skill; the dispatch loads the summary first and the
  full skill only when the task needs the code. (Optional — bigger change.)

### B5. Graphify + capsule (see C, D) also cut tokens by replacing many file-reads with one query/paste.

**How you'll use it:** run `/proxy-start` once per machine (or set the env var permanently) and
every session is 60–70% cheaper. The dispatch + slim CLAUDE.md savings are automatic.

---

## Workstream C — The "context capsule" (never lose a chat, cheap resume)

### C1. New `/handoff` command → writes a portable capsule
- Writes `memory/sessions/compact/<YYYY-MM-DD-HHMM>-<slug>.md` with this exact shape:
  ```
  # Context Capsule — <task title>
  ## Goal            (1–2 lines)
  ## Status          (done ✅ / in-progress 🚧 / not-started ⬜, per item)
  ## Files in play   (path — purpose — key line ranges)   ← so a new chat reads directly
  ## Key decisions   (what was chosen and why)
  ## Open threads / next steps
  ## Commands to re-orient   (e.g. /start, git status)
  ## ── PASTE-TO-RESUME ──   (the whole block, self-contained)
  ```
- The **Files in play** section is the key: exact paths + line ranges + one-line purpose, so a
  fresh chat opens only those files — zero search/grep tokens.

### C2. Auto-generate on compaction (PreCompact hook)
- Wire a `PreCompact` hook in settings.json → runs a script that refreshes the capsule BEFORE
  Claude Code compacts, so nothing is lost when the chat auto-compacts.
- The Stop hook also refreshes it at the end of each session.

### C3. `/resume <capsule-file>` command
- Paste the capsule (or point at the file) → Claude reads it + the listed files directly and
  continues, without re-deriving context.

**How you'll use it:** long chat about to compact? It auto-saves a capsule. Starting fresh?
Paste the capsule into the new chat (or run `/resume <file>`) — the new chat instantly knows the
task, the files, the decisions, and the next step, and reads only the listed files.

---

## Workstream D — Activate pxpipe / Graphify / Headroom for real

### D1. pxpipe — ACTIVATE (default token saver)
- Install-test `npx pxpipe-proxy`, wire the persistent env var, verify savings. (Low effort.)
- **Use:** `/proxy-start` → point Claude Code at the proxy → 60–70% cheaper. `/proxy-status` to check.

### D2. Graphify — INSTALL + BUILD + WIRE
- Install graphify, build the graph into `.claude/graph/` (gitignored), wire `/graph build|deps|explain`
  to the real CLI, test "what depends on X" + "explain this file". (Medium — needs Python.)
- **Use:** `/graph build` after big changes; `/graph deps <symbol>` or `/graph explain <path>` instead
  of grepping many files — one query = fewer tokens + better understanding.

### D3. Headroom — DOCUMENT as the deeper-compression upgrade (optional wire)
- Keep pxpipe as default. Provide a ready `headroom mcp` block in mcp.json (commented) + a one-command
  switch in the upgrade doc, so you can move to Headroom (60–95% + cross-agent memory) when you want.
- **Use:** when you outgrow pxpipe → follow `docs/upgrade-to-headroom.md`, run `headroom wrap claude`,
  disable pxpipe. Don't run both.

---

## Files this plan will add / change

- `.claude/hooks/on-stop.sh` (completion gate) + settings.json (PreCompact hook)
- `.claude/hooks/pre-compact.sh` (new — capsule writer)
- `.claude/commands/handoff.md`, `.claude/commands/resume.md`, `.claude/commands/stop-anyway.md` (new)
- `.claude/rules/rule-completion-standards.md` (hard DoD)
- `.claude/hooks/on-prompt.sh` (top-3 skill cap)
- `CLAUDE.md` (slim + DoD line) + `docs/reference-index.md` (new, the moved tables)
- `.claude/commands/proxy-start.md` verify, `.claude/commands/graph.md` real wiring
- `.claude/agents/agent-completion-loop.md` + 3 building agents (persistence directive)
- `.gitignore` (`.claude/graph/`)

## Rollback / safety
- All additive or hook edits — `git restore` per file. The Stop-hook has a 3-retry cap + escape hatch
  so it can never trap you. Nothing touches production. Everything stays uncommitted unless you say commit.

## Verification
- Persistence: introduce a stub → try to stop → hook blocks + Claude finishes it.
- Tokens: `/proxy-start` → dashboard shows savings; dispatch loads ≤3 skills.
- Capsule: long session → PreCompact writes capsule → paste into new chat → resumes with no re-search.
- Graphify: `/graph build` produces graph.json; `/graph deps` answers correctly.

---

## Decisions I need from you (in the questions that follow)
1. Persistence strength (hard Stop-gate vs soft guidance).
2. Token strategy (pxpipe now / +Graphify / +Headroom).
3. Capsule automation (auto on compaction + Stop, or manual command only).
4. Graphify depth (install+build for real, or keep documented-only for now).
