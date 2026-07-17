---
name: done
description: Save progress and update the memory system at the end of a work session. Run this before closing a chat or switching tasks.
---

Run this at the end of every work session. This saves everything so the next agent picks up exactly where you left off.

## What to do (in this exact order)

### 1. Update project state
Update `memory/project-state.md`:
- Add any newly built modules to the "Built modules" section
- Update the "Pending" section (remove done items, add new ones)
- Update the "Known issues" section

### 2. Log changes
Append to `memory/changes/YYYY-MM-DD-changes.md` (today's date):
- List every file created or modified
- One line per change: `- [file path] — what changed`
- Group by feature/task

### 3. Write session log
Create `memory/sessions/YYYY-MM-DD-HHMM.md` (current timestamp):
```markdown
# Session Log — YYYY-MM-DD HH:MM

**Status:** SAVED
**Started:** <estimated start>
**Ended:** <now>

## What was worked on
- <task 1>
- <task 2>

## Files changed
- <file> — <what changed>

## Decisions made
- <any non-obvious choices made>

## Incomplete work
- <what was NOT finished, if anything>

## Open handoffs
- <what the next agent needs to know, if stopping mid-task>
```

### 4. Release locks
In `memory/coordination/locks.md`, mark any locks you held as `RELEASED`.

### 5. Archive or handoff plans
- If a plan in `memory/plans/_active/` is **complete** → move it to `memory/plans/_archive/` with `-DONE` appended to the filename
- If a plan is **incomplete** → write a handoff in `memory/coordination/handoffs.md` and leave the plan in `_active/`

### 6. Cross-agent learnings
If you discovered something that all future agents should know (a gotcha, an invariant, a pattern) → append it to `memory/coordination/shared-context.md`

### 7. Report
Output a summary:
```
Session saved.
- project-state.md: updated
- changes logged: N files
- session log: memory/sessions/YYYY-MM-DD-HHMM.md
- locks released: <count>
- plans archived: <count>
- handoffs written: <count>

Next session: run /start to load this state.
```

---

Use `/done`:
- Before closing a chat session
- Before switching to a different task or feature
- After completing a feature implementation
- As a safety checkpoint every ~30-60 minutes of active work
