---
name: handoff
description: Write a portable "context capsule" of the current chat — goal, status, files-in-play (with paths), decisions, next steps — so a NEW chat can resume cheaply by pasting it, without re-reading/searching the repo.
---

# /handoff — save a portable context capsule

Use this before a long chat compacts, or before you switch to a new chat, so no
context is lost and the next chat spends almost no tokens re-orienting.

## What to do when invoked

1. **Refresh the mechanical snapshot** (git state + files-in-play):
   ```bash
   bash .claude/hooks/pre-compact.sh handoff
   ```
   This writes `memory/sessions/compact/LATEST-capsule.md`.

2. **Enrich it** — overwrite that file with a richer, human-authored capsule using what
   YOU know from this conversation. Keep the exact section headings below (a new chat
   relies on them). Write a timestamped copy too:
   `memory/sessions/compact/<YYYY-MM-DD-HHMM>-capsule.md`.

   ```markdown
   # Context Capsule — <short task title>
   **Generated:** <date time>  ·  **Branch:** <branch>

   ## Goal
   <1–2 lines: what this chat is trying to accomplish>

   ## Status
   - ✅ <done item>
   - 🚧 <in-progress item>
   - ⬜ <not started>

   ## Files in play  (read these DIRECTLY — do not re-search)
   - `path/to/file.ts` (L10–L60) — <purpose / what changed>
   - `path/to/other.tsx` — <purpose>

   ## Key decisions
   - <what was chosen and WHY>

   ## Open threads / next steps
   1. <the very next action>
   2. <then this>

   ## Gotchas / constraints
   - <anything the next chat must not break, e.g. "leave uncommitted", "no worktrees">

   ## ── PASTE-TO-RESUME ──
   You are resuming the work above. Read the "Files in play" list directly (do not
   grep/search the repo). Read the active plan + latest changes log for full context.
   Continue from "Open threads / next steps". Follow rule-completion-standards.md.
   ```

3. Tell the user the capsule path and that they can **paste it into a new chat** or run
   **/resume** there.

## Why this saves tokens
A new chat that reads the capsule opens ONLY the listed files (with line ranges) instead
of searching/grepping the whole repo. The "Files in play" section is the point — exact
paths mean zero discovery cost.
