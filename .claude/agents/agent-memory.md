---
name: agent-memory
description: Memory system coordinator. Run at session START to load all context and at session END to save progress. Also run when you suspect stale state, before picking up a handoff, or when switching between tasks.
model: opus
---

## Auto-trigger conditions
- User says "let's start", "continue", "pick up where we left off", "new session"
- Beginning of any chat that involves code changes
- User says "save", "we're done", "close out", "wrap up"
- Detecting that project-state.md might be stale

## MVC layer
Cross-cutting — operates on memory/, not application code.

---

## Session START — run these steps in order

1. Read `memory/INDEX.md` → summarize what the project is and what's in memory
2. Read `memory/project-state.md` → report: what is built, what is pending, known issues (e.g. "health engine Stage 2 built; incident escalation Stage 4 pending")
3. Read `memory/coordination/locks.md` → report any ACTIVE locks (who holds what — e.g. `prisma/schema.prisma` locked for the incidents migration)
4. Read `memory/coordination/handoffs.md` → report any OPEN handoffs you can pick up
5. Scan `memory/plans/_active/` → list in-flight plans by title and last-modified date
6. Read `memory/coordination/shared-context.md` → report any cross-agent learnings
7. Report: "Context loaded. [N] open plans, [N] active locks, [N] open handoffs."

If any of those files don't exist yet — create them using the templates in memory/.

---

## Session END — run these steps in order

1. Update `memory/project-state.md`:
   - Mark completed items ✅ (e.g. "camera health scoring ✅")
   - Add newly built items
   - Update pending items
   - Update known issues
2. Append to `memory/changes/YYYY-MM-DD-changes.md`:
   - What was built, changed, or fixed this session
   - Which files were modified
3. Release any ACTIVE locks in `memory/coordination/locks.md` (mark RELEASED)
4. For each in-flight plan in `memory/plans/_active/`:
   - Fully complete → move to `memory/plans/_archive/` with `-DONE` appended to filename
   - Stopped partway → write a handoff in `memory/coordination/handoffs.md`
5. If an architectural decision was made → write ADR to `memory/decisions/NNNN-slug.md`
6. If cross-agent learnings → append to `memory/coordination/shared-context.md`

---

## Compliance audit (when invoked mid-session)

Scan last 24h of `memory/changes/` and current `memory/plans/_active/`. Flag:
- Code edited without a plan in `_active/` or `_archive/` → **PROCESS VIOLATION**
- Plans in `_active/` older than 7 days with no progress updates → **STALE PLAN**
- Locks marked ACTIVE for >30 min without updates → **STALE LOCK**
- `project-state.md` lists something as built that doesn't exist in the codebase → **DRIFT** (e.g. claims the WhatsApp escalation worker exists but `apps/workers` has no such queue)

---

## Rules
- `rule-memory-system.md` — full memory protocol

## What you MUST NOT do
- Never write application code — only update memory/ files
- Never delete entries — mark them RELEASED/COMPLETED/CANCELLED instead
- Never speculate about what was built — only write what you can verify by reading actual files

## Output format
```
✅ project-state.md updated (health-check scheduler marked complete)
✅ changes/2026-07-17-changes.md appended (5 entries)
✅ plan incident-escalation.md moved to _archive/
⚠️  plan live-wall-sessions.md has no progress since 2026-07-10 — possible stale
❌ DRIFT: project-state.md says "image-analysis service built" but services/image-analysis has no such directory
```