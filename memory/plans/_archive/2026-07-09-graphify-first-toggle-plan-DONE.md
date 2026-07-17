# Plan: Graphify-first toggle — force "check the graph before editing," on/off with one change

**Created:** 2026-07-09
**Owner agent:** claude (main loop)
**Status:** active — AWAITING USER APPROVAL (do not implement yet)

---

## What you asked for
- A hook that, when **ON**, makes me **consult the Graphify graph first** before changing any code.
- When **OFF**, behavior reverts to normal (Graphify used only when the task needs it).
- Toggle with **one change**, and easy to see whether it's on or off.

---

## How it will work

A single toggle value decides the mode. The `on-prompt.sh` hook reads it on every prompt:

```
prompt → on-prompt.sh reads .claude/graph-mode
   ├─ "on"  → inject a "GRAPHIFY-FIRST" directive:
   │           "Before editing any file, query the graph (/graph inbound <target> or
   │            python -m graphify explain) to understand blast radius; state what you found,
   │            then edit." → I always check the graph first.
   └─ "off" → inject nothing → today's smart behavior (I query the graph only when a
              change ripples / is a refactor / you ask an architecture question).
```

The toggle is a tiny file **`.claude/graph-mode`** containing one word: `on` or `off` (default `off`).

---

## How you enable / disable it (three ways, all "one change")

1. **Slash command (easiest):**
   - `/graph-always on`  → turns it on
   - `/graph-always off` → turns it off
   - `/graph-always status` → tells you the current mode
2. **Edit one word:** open `.claude/graph-mode`, change `off` → `on` (or back). Save.
3. **Terminal one-liner:** `echo on > .claude/graph-mode` (or `echo off > .claude/graph-mode`).

To check the current mode anytime: `/graph-always status`, or `cat .claude/graph-mode`, or the daily
Setup Doctor line will show it.

---

## Scope of the trigger when ON (recommended: smart, not literally every prompt)
- **Recommended:** when ON, inject the graph-first directive **only on code-change-intent prompts**
  (matching build/change/edit/refactor/add/update/fix/move/rename/delete keywords). Pure questions
  ("what does X do?") and trivial chat don't force a graph query → saves tokens.
- **Alternative:** literally every prompt (even pure questions) → more thorough, more token cost.
  (You can pick this in the questions below.)

Either way, OFF = today's behavior exactly.

---

## Components to build
1. **`.claude/graph-mode`** — the toggle file (one word: `off` by default).
2. **`.claude/hooks/on-prompt.sh`** — read the toggle; when `on` (+ change-intent if smart mode),
   inject the GRAPHIFY-FIRST directive block. ~10 lines, near the top.
3. **`.claude/commands/graph-always.md`** — `/graph-always on|off|status` command.
4. **Setup Doctor line (optional):** show "Graphify-first mode: ON/OFF" so you always know the state.
5. **Docs:** one line in `.claude/commands/graph.md` + CLAUDE.md noting the toggle.

## Token impact
- **OFF (default):** zero change — no extra tokens.
- **ON:** ~4 injected lines per (change-intent) prompt + one graph query per edit. That's the whole
  point of the mode; it's opt-in and reversible instantly.

## Verification
- `/graph-always on` → next change prompt shows the GRAPHIFY-FIRST directive injected; I query the
  graph before editing.
- `/graph-always off` → directive gone; normal behavior.
- `cat .claude/graph-mode` reflects the current state; `/graph-always status` reports it.

## Rollback
- Additive. `git restore .claude/hooks/on-prompt.sh` + delete the 2 new files. The toggle file is
  harmless if left (defaults to off).

## Decisions needed (below)
1. When ON: smart (only change-intent prompts) vs literally every prompt.
2. Toggle file: committed (travels with repo — team shares the default) vs gitignored (per-machine).
