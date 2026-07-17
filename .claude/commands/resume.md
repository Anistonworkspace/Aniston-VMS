---
name: resume
description: Resume work from a context capsule (from /handoff or the auto PreCompact hook). Reads the capsule + the files it lists directly, so a new chat continues without re-searching the repo.
---

# /resume — continue from a context capsule

Use at the START of a new chat to pick up exactly where a previous chat left off,
cheaply. Usage: `/resume` (uses the latest capsule) or `/resume <path-to-capsule.md>`.

## What to do when invoked

1. **Locate the capsule:**
   - If a path was given, use it.
   - Otherwise read `memory/sessions/compact/LATEST-capsule.md` (the most recent).
   - If neither exists, say so and offer to run `/start` instead.

2. **Read the capsule**, then read ONLY the files it lists under "Files in play"
   (with their line ranges). **Do NOT grep/search the whole repo** — the capsule's
   file list is authoritative; that is the whole point (zero discovery cost).

3. Also read the referenced active plan and latest changes log if named in the capsule.

4. **Confirm orientation** in 3–5 lines: the goal, what's done, and the next action —
   then continue from "Open threads / next steps".

5. Follow `rule-completion-standards.md` (finish to production; the Stop-gate is active).

## Note
If the user pasted the capsule text directly into the chat instead of a path, just use
that pasted text — it is self-contained (it ends with a "PASTE-TO-RESUME" block).
