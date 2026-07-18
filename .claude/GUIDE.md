# GUIDE — How the Aniston VMS toolkit works & how to use it

The single entry point for the Aniston VMS project's Claude Code harness: the `.claude/` agent
layer, the memory system, the token-saving proxy, the codebase graph, and the build tooling for
5 targets (web, PWA, Android, iOS, desktop) — all aimed at building the CCTV monitoring platform
described in the plan docs. You describe what to build; the agents build it against the target
architecture in [`docs/02-TRD.md`](../docs/02-TRD.md) + [`docs/06-implementation-plan.md`](../docs/06-implementation-plan.md).
Deep references are linked, not duplicated: [`docs/NEW-MACHINE-SETUP.md`](../docs/NEW-MACHINE-SETUP.md),
[`docs/reference-index.md`](../docs/reference-index.md) (full canon doc index — `01-PRD.md` through
`06-implementation-plan.md`, `claude-code-master-prompt.md`, `actual-design.png`),
[`docs/tech-stack-targets.md`](../docs/tech-stack-targets.md).

---

## 1. Working tree (what's where)

```
.claude/                 ← THE PRODUCT: the AI-agent layer
  agents/     (21)       role definitions Claude applies per task
  skills/     (51)       copy-paste code patterns the agents follow
  rules/      (18)       binding standards (MVC, RBAC, testing, logging…)
  commands/   (30)       slash commands (see §5)
  hooks/      (6)        on-prompt, pre-command, lint-on-save, on-stop, pre-compact, doctor
  scripts/               graph.mjs (Node fallback graph)
  mcp.json               4 auto-wired MCP servers (filesystem, postgres, github, memory)
  settings.json          model, permissions (allow/deny), hook wiring
  graph-mode             toggle: Graphify-first on/off (§4)
  logs/                  command/edit history, doctor + gate markers (gitignored)
memory/                  ← persistent context across sessions
  INDEX.md, project-state.md, decisions/ (ADRs), plans/_active + _archive,
  changes/ (daily logs), coordination/ (locks, handoffs), sessions/compact/ (capsules)
backend/src/             Express skeleton: server, app (health only), config, lib (prisma/redis/logger),
                         middleware (errorHandler, rateLimiter, requestId, requestLogger, validation), utils/encryption
frontend/src/            React skeleton: app shell, design-system UI primitives, PWA sw.ts, one placeholder page
shared/src/              generic API contract (ApiResponse, PaginationMeta) + common Zod schemas
prisma/                  schema.prisma (ships ZERO models) + no-op seed
agent-desktop/           Electron (Windows EXE) shell
docs/                    architecture, ERD, api-conventions, setup guides, tech-per-target
scripts/                 setup.sh/ps1 (app) + setup-ai-tools.sh/ps1 (AI tools)
store-releases/          Android/iOS/desktop publish checklists
graphify-out/            the generated codebase graph (gitignored, regenerable)
```

---

## 2. The pipeline & flow (the layers)

```
  You (VS Code extension OR terminal)
        │  prompt
        ▼
  ┌─────────────────┐  compresses the request (image-encodes bulky context)
  │  pxpipe proxy   │  → 60–70% fewer input tokens        [runs via: npx pxpipe-proxy]
  └─────────────────┘
        │  → api.anthropic.com
        ▼
  ┌───────────────────────────────────────────────┐
  │  on-prompt.sh hook (UserPromptSubmit)          │  BEFORE Claude sees the prompt
  │   • Setup Doctor (once/day) — gates building    │
  │   • Keyword dispatch → injects top-3 skills +   │
  │     rules + agents + suggested /commands        │
  │   • Graphify-first directive (if toggle ON)     │
  └───────────────────────────────────────────────┘
        │
        ▼
  ┌─────────────┐  reads prompt + injected guidance, decides approach,
  │  Claude     │  queries the graph when a change ripples, edits files
  └─────────────┘
        │
        ▼
  ┌───────────────────────────────────────────────┐
  │  on-stop.sh hook (Stop)                         │  AFTER Claude responds
  │   • Completion gate — blocks stopping on a       │
  │     stub/TODO/typecheck fail (Fable-grade)       │
  │   • Refreshes the context capsule                │
  └───────────────────────────────────────────────┘
```
Other hooks: **pre-command.sh** (blocks dangerous Bash, reminds about side effects),
**lint-on-save.sh** (reminders on schema/route/service edits), **pre-compact.sh** (writes a
context capsule before compaction).

---

## 3. What happens when you give a prompt (step by step)

1. **pxpipe** compresses the request and forwards it (if the proxy is running + env var set).
2. **`on-prompt.sh`** fires:
   - runs the **Setup Doctor** (first prompt of the day) — if required tools aren't green, it
     injects the fix steps and the **hard gate** ( `/build-loop` + `/new-module` refuse to run);
   - scans your prompt's keywords → injects the **top-3 relevant skills + rules + agents** and
     **suggested slash commands**;
   - if **Graphify-first mode is ON** (§4) and the prompt is a code change → injects "query the
     graph before editing".
3. **Claude** reads your prompt + that guidance and decides:
   - localized change → read the file(s) → edit;
   - ripples (shared type / hub file) or you asked an architecture question → query the graph
     (`/graph inbound`, `/graphify`) first, then edit.
4. **`on-stop.sh`** checks the work isn't half-done (no stubs/TODOs, typecheck clean) and refreshes
   the capsule. If incomplete, it sends Claude back to finish (escape with `/stop-anyway`).

**Is the graph checked automatically every time?** No — only when Graphify-first mode is ON, or
when Claude judges a change needs it. Flip it with `/graph-always on`.

---

## 4. Toggles & knobs

| Knob | What it does | Turn on/off |
|---|---|---|
| **Graphify-first** (`.claude/graph-mode`) | Force a graph check before editing on code-change prompts | `/graph-always on` \| `off` \| `status` — or `Set-Content .claude\graph-mode on` |
| **Completion gate** (`on-stop.sh`) | Blocks stopping on incomplete work | one-shot bypass: `/stop-anyway` (or `ALLOW_INCOMPLETE=1`) |
| **Setup Doctor** | Daily check + hard build-gate | auto; re-check `/doctor`, auto-fix `/doctor --fix` |
| **Build-loop caps** | Iterations / token cap for `/build-loop` | env: `BUILD_LOOP_MAX_ITERATIONS`, `BUILD_LOOP_MAX_TOKENS` |
| **pxpipe** | Token-compression proxy | `ANTHROPIC_BASE_URL=http://127.0.0.1:47821` + `npx pxpipe-proxy` |

---

## 5. Command reference (all 30)

**Daily workflow**
| Command | Purpose |
|---|---|
| `/start` | Load all memory context at the start of a chat |
| `/done` | Save progress, update memory, release locks |
| `/handoff` | Write a portable context capsule (resume in a new chat cheaply) |
| `/resume` | Continue from a capsule — reads only the listed files, no repo search |
| `/compact-save` | Save a compaction summary to memory |
| `/health` | Check the dev environment (services, env, DB) |
| `/doctor` | Check the AI-tool setup; `/doctor --fix` auto-installs the safe pieces |

**Design → build (the main flow)**
| Command | Purpose |
|---|---|
| `/design-first <name> "<desc>"` | Interview-driven system design FIRST → ADR + PRD + ERD |
| `/design-review` | Adversarial review of the latest design ADR |
| `/build-loop <name> "<spec>"` | Test-first, loop-until-green feature scaffolder (gated by `/doctor`) |
| `/new-module <name>` | Scaffold an MVC module (gated by `/doctor`) |
| `/verify-wired <name>` | 12-hop end-to-end trace of a module |
| `/add-tests <target>` | Write Vitest unit + Playwright E2E tests |
| `/document <target>` | Swagger JSDoc + README + ADR |

**Codebase intelligence**
| Command | Purpose |
|---|---|
| `/graph <sub>` | Dependency graph — `build`/`deps`/`inbound`/`explain` (prefers Graphify, Node fallback) |
| `/graph-always on\|off\|status` | Toggle graph-first mode |
| `/graphify` (global skill) | Rich semantic graph Q&A (communities, `graph.html`) |
| `/trace <workflow>` | Trace a full UI→DB→socket workflow |
| `/explain <target>` | Explain any module layer-by-layer |

**Quality & ops**
| Command | Purpose |
|---|---|
| `/audit` | 10-dimension codebase audit |
| `/security-scan` | OWASP Top 10 |
| `/optimize <target>` | Fix N+1, missing indexes, slow renders |
| `/fix-critical <desc>` | P0/P1 bug via the safe fix process |
| `/release-check` | Pre-deploy gate |
| `/migrate <desc>` | Safe DB migration workflow |
| `/deploy` | Deploy to production |

**Cost & meta**
| Command | Purpose |
|---|---|
| `/proxy-start` | Start pxpipe (token-saving proxy) |
| `/proxy-status` | pxpipe health + tokens saved |
| `/stop-anyway` | Override the completion gate once |
| `/project-init` | Rename the toolkit for a new project |
| `/help` | List all commands |

---

## 6. Check anything by command

| Want to check | Command |
|---|---|
| Is the whole AI setup healthy? | `bash .claude/hooks/doctor.sh` (or `/doctor`) |
| Which Graphify-first mode? | `Get-Content .claude\graph-mode` (or `/graph-always status`) |
| Is pxpipe saving tokens? | open `http://127.0.0.1:47821/` · `cat ~/.pxpipe/events.jsonl` · `/proxy-status` |
| The codebase graph | `python -m graphify update .` then `python -m graphify explain "<name>"` |
| Graph blast radius before an edit | `/graph inbound <file>` |
| Repo state / uncommitted | `git status` · `git log --oneline -5` |
| Does it still compile? | `npm run typecheck` |
| Is Graphify installed (which Python)? | `python -m pip show graphifyy` |
| What was I doing last chat? | `cat memory/sessions/compact/LATEST-capsule.md` (or `/resume`) |

---

## 7. After clone — use this repo on a new machine

```
1. Install Node 20+ and Python 3.10–3.13
2. git clone <repo> && cd <repo>
3. npm install
4. npm run setup:ai          # installs graphifyy + /graphify skill + builds the graph
5. setx ANTHROPIC_BASE_URL "http://127.0.0.1:47821"   # then RESTART the terminal
6. npx pxpipe-proxy          # keep this terminal open while you work
7. Open Claude Code → /doctor   (should be all green)
8. /design-first MyApp "…"  →  /build-loop <module>
```
Full detail + troubleshooting: [`docs/NEW-MACHINE-SETUP.md`](../docs/NEW-MACHINE-SETUP.md).

> **Known caveat:** the skeleton ships no auth/permissions/audit foundation, but the skills/rules
> reference them. Building an authed feature will need that foundation scaffolded first (deferred
> by design). See the reusability plan in `memory/plans/`.

---

## 8. Token-saving stack (why this is cheap)
1. **pxpipe** — compresses the request stream (60–70%).
2. **Graph queries** — one `/graphify` query replaces reading 10+ files.
3. **Top-3 skill dispatch** + **slim CLAUDE.md** — less loaded every message.
4. **Context capsule** — new chats resume without re-reading the repo.
5. **Completion gate + build-loop** — finishes in one pass, no wasted re-work turns.
