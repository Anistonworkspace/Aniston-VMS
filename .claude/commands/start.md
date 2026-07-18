---
name: start
description: Load full project context at the start of any new chat or after a context reset. ALWAYS run this first before doing any work.
---

Run this as the very first command in any new chat session. Never skip it.

Aniston VMS is a multi-tenant CCTV/camera fleet health-monitoring platform — cameras/routers/SIMs are
health-probed continuously, degraded/offline conditions open Incidents, unacknowledged Incidents escalate
with WhatsApp/email notifications, and operators watch it all live on a zone-scoped live wall.

## What to do (in this exact order)

### 1. Check for compaction recovery
Look in `memory/sessions/compact/` for any `.md` files from today or the most recent date.
If one exists: read it and report: "Recovering from compaction: [filename] — [1-line summary of state]."
This means the previous session was interrupted mid-task.

### 2. Read last session log
Find the most recent file in `memory/sessions/` (not in `compact/`, not `_template.md`).
If one exists: read it and report what the last session worked on and whether anything was left incomplete.

### 3. Read project state
Read `memory/project-state.md`. Report:
- What is built (list all modules)
- What is pending (list all pending items)
- Any known issues

### 4. Check for active locks
Read `memory/coordination/locks.md`. Report any `HELD` locks — these files are being edited by another agent. Warn before editing those files.

### 5. Check for open handoffs
Read `memory/coordination/handoffs.md`. Report any `OPEN` handoffs — these are unfinished tasks left by a previous session. Ask if you should pick one up.

### 6. Check for active plans
Scan `memory/plans/_active/`. List any plans found by title. If one is found, suggest continuing it rather than starting from scratch.

### 7. Report summary

Output exactly this format:
```
Context loaded.
- Project: [name] — [one-line description]
- Built: [count] modules ([list names, e.g. camera onboarding, live wall, incidents, escalation, audit log])
- Pending: [count] items
- Open plans: [count] ([titles])
- Active locks: [count] ([files if any])
- Open handoffs: [count] ([titles if any])
- Last session: [date] — [one-line summary] [COMPLETE/INCOMPLETE]
[If compaction recovery]: ⚠ Recovered from compaction: [filename]
```

Ready to work. What are we building today?

---

Use `/start`:
- At the beginning of every new chat (mandatory)
- After a context-compaction event (see /compact-save)
- When picking up work started by another agent
- Whenever you feel you are operating on stale assumptions
