---
name: compact-save
description: Save the current compaction summary to memory so the next session can recover full context. Run this IMMEDIATELY whenever the conversation was just compacted.
---

Run this immediately after any context-compaction event.

## What to do

1. Create the file `memory/sessions/compact/YYYY-MM-DD-HHMM-compact.md` (use the actual current date/time)
2. Copy the full compaction summary into the file verbatim — do not paraphrase or shorten
3. Fill in the "Key state at compaction point" section:
   - What task was in progress when compaction happened
   - Which files were being edited
   - Any blockers encountered before compaction
   - The exact next step to resume
4. Confirm: "Compaction saved to memory/sessions/compact/YYYY-MM-DD-HHMM-compact.md"

## Template to use

```markdown
# Compaction Summary — YYYY-MM-DD HH:MM

**Type:** context-compaction
**Original session:** YYYY-MM-DD HH:MM

---

## Summary (preserved from compaction)

<paste the full compaction summary here>

---

## Key state at compaction point

- Last task in progress: <describe>
- Files being edited: <list>
- Any blockers encountered: <describe or "none">
- Next step after resuming: <exact next action>
```

## Why this matters

When Claude Code compacts the conversation, all detailed context (exact file contents seen, decisions made mid-session, errors encountered) is lost. The summary that replaces it is accurate but loses specifics.

By saving it here, the next `/start` can read this file and the agent resumes with full awareness of what was happening at the compaction point — not just a high-level summary.

## When to use

- Automatically: Claude detects a compaction has just occurred (summary appears at top of conversation)
- Manually: type `/compact-save` after a long session to checkpoint the context
