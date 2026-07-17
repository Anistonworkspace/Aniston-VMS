---
# Memory System Rules (BINDING)

This project has a persistent, file-based memory system at memory/. All agents must use it.

## Mandatory start-of-work sequence (do this before ANY code changes)

1. Read memory/INDEX.md
2. Read memory/project-state.md
3. Read memory/coordination/locks.md — if your target files are locked, coordinate via memory/coordination/handoffs.md instead
4. Skim memory/coordination/shared-context.md
5. Check memory/coordination/handoffs.md for OPEN handoffs you can pick up
6. Check memory/plans/_active/ — if a plan covers your task, continue it instead of starting new
7. Read relevant ADRs in memory/decisions/ for the area you are about to touch

Skip this sequence ONLY for purely informational requests where no files will be modified.

## Mandatory plan-before-action

For ANY change touching more than ~10 lines or more than 1 file:
  Write a plan to memory/plans/_active/YYYY-MM-DD-slug.md using memory/plans/_template.md BEFORE editing code
  Trivial fixes (single typo, single-line bug fix) can skip the plan but still need a changes/ entry

## Mandatory file-lock registration

When editing shared files (auth, RBAC, Prisma schema, shared types) OR more than 3 files at once:
  Register a lock in memory/coordination/locks.md BEFORE editing
  Release the lock (mark RELEASED) when done

## Mandatory end-of-work sequence

1. Update memory/project-state.md to reflect the new state
2. Append to today's memory/changes/YYYY-MM-DD-changes.md
3. Release any locks you held
4. If stopped partway → write handoff in memory/coordination/handoffs.md, leave plan in _active/
5. If finished → move plan from _active/ to _archive/ with -DONE appended to filename
6. If you learned something cross-agent-relevant → append to memory/coordination/shared-context.md
