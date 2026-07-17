# New Machine Setup — get every AI tool working after a clone

This boilerplate's value is its AI-agent layer. Some pieces ship **in the repo** (they arrive
with `git clone`); others are **machine-level** (you install them once per computer). This guide
gets everything green.

> **TL;DR:** install Node + Python, clone, `npm install`, then **`npm run setup:ai`** (or
> `.\scripts\setup-ai-tools.ps1` on Windows). Then `/doctor` should be all-green.

---

## What clones vs what's machine-level

| Piece | Arrives with `git clone`? | You install per machine |
|---|---|---|
| handoff / resume / context capsule | ✅ yes | — |
| Completion Stop-gate, top-3 dispatch, slim CLAUDE.md | ✅ yes | — |
| `/graph` Node fallback tool | ✅ yes | — |
| Setup Doctor (`/doctor`) | ✅ yes | — |
| **Graphify** (`/graphify`, semantic graph) | ❌ no | `pip install graphifyy` + skill install |
| **pxpipe** proxy | command ships; needs env var | set `ANTHROPIC_BASE_URL` |
| **Headroom** (optional) | doc only | `pip install headroom-ai` |
| The graph itself (`graphify-out/`) | ❌ no (gitignored) | `python -m graphify update .` |

---

## Steps

### 1. Prerequisites (once per machine)
- **Node 20+** — https://nodejs.org  (`node -v`)
- **Python 3.10+** — https://python.org  (`python --version`) — needed for Graphify
- **Git**

### 2. Clone + install app deps
```bash
git clone <your-repo-url>
cd <repo>
npm install
```

### 3. Install the AI tools (one command)
```bash
npm run setup:ai            # bash / macOS / Linux / Git-Bash
# Windows PowerShell:
npm run setup:ai:win        # or:  .\scripts\setup-ai-tools.ps1
```
This installs Graphify (`graphifyy`), its `/graphify` skill, builds the codebase graph, and prints
the pxpipe/Headroom steps. It's idempotent — safe to re-run.

### 4. Turn on the pxpipe token-saver (once per machine)
```powershell
setx ANTHROPIC_BASE_URL "http://127.0.0.1:47821"   # Windows — then restart the terminal
# macOS/Linux: add to ~/.bashrc/.zshrc:  export ANTHROPIC_BASE_URL=http://127.0.0.1:47821
```
Each work session, start the proxy: `npx pxpipe-proxy` (or `/proxy-start` in Claude Code).

### 5. (Optional) Headroom — deeper compression
```bash
pip install headroom-ai
```
See `docs/upgrade-to-headroom.md`. Use *instead of* pxpipe, not both.

### 6. Point Claude Code at your API key
```powershell
setx ANTHROPIC_API_KEY "sk-ant-..."
```

### 7. Verify
Open Claude Code in the repo and run **`/doctor`** — everything required should be ✅.
If not, run **`/doctor --fix`** and follow any remaining ⛔ steps.

---

## Then build
```
/start                     load memory context
/design-first MyApp "…"    system design first (ADR + PRD + ERD)
/build-loop <module>       test-first, loops until production-complete
```

The **first prompt of each day** auto-runs the Setup Doctor. If a required tool is missing, Claude
auto-fixes what it can and tells you the rest — and **`/build-loop` / `/new-module` refuse to run
until the doctor is green** (hard gate), so you never build in a degraded, token-wasting setup.

---

## Troubleshooting
- **`graphify: command not found`** — the CLI isn't on PATH; always use `python -m graphify`.
- **Installed `graphify` but it's the wrong tool** — the correct package is **`graphifyy`** (double-y);
  plain `graphify` on PyPI is an unrelated charting library. `pip uninstall graphify && pip install graphifyy`.
- **pip build fails on a brand-new Python** — Graphify's native deps may lag the newest Python; use a
  Python 3.11–3.13 if 3.14+ fails.
- **Doctor says graph stale** — run `python -m graphify update .` (0 API tokens).
