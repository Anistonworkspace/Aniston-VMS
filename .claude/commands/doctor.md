---
name: doctor
description: Check the AI-tool setup (Node, Python, Graphify, /graphify skill, graph, handoff, pxpipe, Headroom) and report what's OK, what Claude can auto-fix, and what the user must do. Use `/doctor --fix` to auto-install the safe pieces.
---

# /doctor — AI-tools setup check

Verifies the whole AI toolchain is set up correctly (in the system AND the repo) so
prompting is correct and cheap. Runs the same from the VS Code extension or the terminal.
The first prompt of each day runs this automatically; use `/doctor` to re-check anytime.

## What to do when invoked

**`/doctor`** (plain check):
```bash
bash .claude/hooks/doctor.sh
```
Print the report. It marks each item:
- ✅ OK
- 🔧 [REQUIRED] auto-fixable — Claude may run the shown command
- ⛔ [REQUIRED] user action needed (install Node/Python, re-clone) — show the exact step + issue
- ⚠️ [RECOMMENDED] pxpipe not set — token-saver, not blocking
- ℹ️ [OPTIONAL] Headroom — deeper compression, optional

**`/doctor --fix`** (auto-repair the safe pieces):
```bash
bash .claude/hooks/doctor.sh --fix
```
This runs `npm install`, `pip install graphifyy`, `python -m graphify install --platform claude`,
and `python -m graphify update .` as needed, then re-checks. After it finishes, tell the user any
remaining ⛔ items that only they can do (install Node/Python, set the pxpipe env var).

## The hard gate

If required tools are missing, **do NOT scaffold/build/modify project code.** Instead:
1. Run `/doctor --fix` (auto-installs the safe pieces).
2. For anything still ⛔, give the user the exact command/step + the specific issue.
3. Only build once `bash .claude/hooks/doctor.sh --quiet` exits 0.

`/build-loop` and `/new-module` enforce this automatically — they refuse to run until the doctor is green.

## Full setup guide
For a fresh machine, see [`docs/NEW-MACHINE-SETUP.md`](../../docs/NEW-MACHINE-SETUP.md) or run
`npm run setup:ai` (bash) / `npm run setup:ai:win` (PowerShell).
