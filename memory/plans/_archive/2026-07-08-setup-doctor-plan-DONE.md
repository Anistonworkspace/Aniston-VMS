# Plan: AI-tools "Setup Doctor" — auto-check + auto-fix on first prompt, guide user on failure

**Created:** 2026-07-08
**Owner agent:** claude (main loop)
**Status:** active — APPROVED 2026-07-08, implementing

## Decisions locked by user
1. Frequency: **once per day** (first prompt each day; marker `.claude/logs/.doctor-YYYYMMDD`).
2. Auto-fix: **Claude auto-runs the safe installs** (npm/pip/graphify build+skill) from first prompt.
3. Gate: **HARD — block building until green**, enforced by build commands checking `doctor.sh` exit code.
4. Headroom: **optional** (pxpipe is the default token-saver).

## Refinement applied (hard-gate scope)
- **REQUIRED (blocks /build-loop, /new-module, code changes):** Node ≥20, Python ≥3.10, npm deps,
  graphifyy, /graphify skill, fresh graph, handoff/capsule wiring.
- **RECOMMENDED (warn only, never blocks):** pxpipe env + running, Headroom — these are pure cost
  optimizers; a momentarily-down proxy must not freeze development. Can be promoted to REQUIRED later.

---

## What you asked for

1. **One-command setup** (Option A) so a new laptop installs everything.
2. **Auto-check on the first prompt of every chat** — before the user builds anything, verify
   graphify / pxpipe / handoff / headroom are correctly set up **both in the system and in the repo**.
3. If something's missing → **Claude first tries to fix it itself**; if it can't, **tell the user the
   exact steps + the specific issue** (only the failing ones, not all).
4. If everything's good → user proceeds to build.
5. Works identically from the **VS Code extension** AND the **terminal**.

---

## How it works (the flow)

```
First prompt of a chat
   │
   ▼
on-prompt.sh  ──(once per session)──►  doctor.sh   (read-only checks)
   │                                      │
   │                                      ▼
   │                             emits a STATUS BLOCK into Claude's context:
   │                               • ✅ what's OK
   │                               • 🔧 what's AUTO-FIXABLE (+ the exact command)
   │                               • ⛔ what needs the USER (+ steps + the issue)
   ▼
Claude reads the block and:
   • runs the safe AUTO-FIXES itself (pip install graphifyy, build graph, install skill)
   • for USER-ACTION items → prints the precise steps + why it failed, and asks the user to do them
   • when all green → "Setup OK — you can build."
```

- Runs **once per chat session** (keyed on the hook's `session_id`, fallback: once per day) so it
  doesn't cost tokens on every prompt. When healthy it emits a 1-line "✅ AI tools ready".
- Re-runnable anytime via **`/doctor`**.
- Same hook fires in the VS Code extension and the terminal — identical behavior.

---

## The doctor check matrix

| # | Check | How | If missing → |
|---|---|---|---|
| 1 | **Node ≥ 20** | `node -v` | ⛔ USER installs Node (can't auto) |
| 2 | **Python ≥ 3.10** | `python --version` | ⛔ USER installs Python (can't auto) |
| 3 | **npm deps installed** | `node_modules` exists | 🔧 AUTO: `npm install` |
| 4 | **Graphify pkg** | `python -m graphify --help` | 🔧 AUTO: `pip install graphifyy` (needs Python) |
| 5 | **/graphify skill** | `~/.claude/skills/graphify/SKILL.md` | 🔧 AUTO: `python -m graphify install --platform claude` |
| 6 | **Graph generated** | `graphify-out/graph.json` exists + fresh | 🔧 AUTO: `python -m graphify update .` |
| 7 | **handoff/capsule wiring** | hooks + settings PreCompact present | ✅ (ships in repo; if absent → repo not fully cloned) |
| 8 | **pxpipe env** | `ANTHROPIC_BASE_URL` set | ⛔ USER: `setx ANTHROPIC_BASE_URL http://127.0.0.1:47821` (needs terminal restart) |
| 9 | **pxpipe running** | curl `127.0.0.1:47821` | 🔧 AUTO-suggest `/proxy-start` (background proc — offer, don't force) |
| 10 | **Headroom (optional)** | `python -m headroom --help` | ℹ️ OPTIONAL — only checked if user opted in |

"Fresh" for the graph = `built_at_commit` in the report ≠ current `git rev-parse HEAD` → suggests rebuild.

---

## Components to build

1. **`scripts/setup-ai-tools.ps1`** (Windows/PowerShell) + **`scripts/setup-ai-tools.sh`** (bash/mac/linux)
   — idempotent one-command installer: npm install → pip install graphifyy → graphify install →
   build graph → print pxpipe env instructions → optional headroom. Skips anything already done.
2. **`.claude/hooks/doctor.sh`** — the read-only checker. Prints a structured report
   (machine-readable tags `OK:/FIX:/USER:` + human text). Never installs on its own.
3. **`on-prompt.sh` integration** — on the first prompt of a session, run `doctor.sh`; if anything is
   not-green, inject its report so Claude auto-fixes + guides. Session-guarded (marker keyed on
   `session_id`) so it runs once per chat, not per prompt.
4. **`.claude/commands/doctor.md`** — `/doctor` to re-check on demand; `/doctor --fix` to auto-fix.
5. **`docs/NEW-MACHINE-SETUP.md`** — the full new-laptop guide (prerequisites → clone → npm →
   AI tools → env → graph → API key → build), baked into the repo so it's there on clone.
6. **`package.json`** — add `"setup:ai": "..."` script (runs the right installer per OS).
7. **CLAUDE.md** — one line: "First prompt runs the setup doctor; fix any ⛔ items before building."

---

## Auto-fix policy (what Claude runs itself vs asks the user)

- **Claude auto-runs (safe, idempotent):** `npm install`, `pip install graphifyy`,
  `python -m graphify install --platform claude`, `python -m graphify update .`.
- **Claude asks the user (can't or shouldn't auto):** installing Node/Python (machine installers),
  setting the persistent `ANTHROPIC_BASE_URL` (needs a terminal restart to take effect),
  starting the long-lived pxpipe proxy (offers `/proxy-start`), installing optional Headroom.
- Every auto-fix is announced ("Running `pip install graphifyy`…") and its result reported.

---

## Gate behavior (soft, not blocking)

- The doctor **warns prominently** and **auto-fixes**, but does **not hard-block** you from working —
  handoff/capsule/Stop-gate/Node-graph all work without Python, so a partial setup is still usable.
- It clearly states: "Token-savers (Graphify/pxpipe) are DEGRADED until you finish steps X, Y" so you
  know you're paying more tokens until it's fixed. (A hard block is available if you prefer — see decisions.)

---

## Files added / changed
- New: `scripts/setup-ai-tools.ps1`, `scripts/setup-ai-tools.sh`, `.claude/hooks/doctor.sh`,
  `.claude/commands/doctor.md`, `docs/NEW-MACHINE-SETUP.md`
- Changed: `.claude/hooks/on-prompt.sh` (session-guarded doctor call), `package.json` (setup:ai script),
  `CLAUDE.md` (one line)

## Verification
- Simulate a fresh machine: temporarily rename graphify-out + unset env → `/doctor` reports the right
  ⛔/🔧 items with exact commands.
- New session → on-prompt emits the doctor block once; second prompt in same session → silent.
- `scripts/setup-ai-tools.sh` run twice → second run is a no-op (idempotent).
- Doctor runs identically when invoked from a piped stdin (extension) and terminal.

## Rollback
- All additive except the small `on-prompt.sh` + `package.json` + CLAUDE.md edits → `git restore` per file.
- The doctor is read-only; auto-fixes are standard installs, reversible (`pip uninstall`, delete graph).

---

## Decisions I need before implementing
1. Doctor frequency: once per session (recommended) / once per day / every prompt.
2. Auto-fix: Claude auto-runs the safe installs (recommended) / only ever recommends, never runs.
3. Gate: soft warn + degrade (recommended) / hard block building until 100% green.
4. Headroom: optional (recommended — pxpipe is default) / required to pass the doctor.
