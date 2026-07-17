---
name: stop-anyway
description: Override the completion Stop-gate once, so Claude may stop even though work is incomplete. Use when you deliberately want to pause with unfinished code.
---

# /stop-anyway — override the completion gate (once)

The Stop hook (`on-stop.sh`) blocks stopping while the working tree has incompleteness
markers (TODO/FIXME/not-implemented/stubs/backend console.log). This command tells it to
allow the very next stop anyway.

## What to do when invoked

1. Create the one-shot escape marker:
   ```bash
   touch .claude/logs/.stop-anyway
   ```
2. Briefly list what is still incomplete (so the pause is intentional, not accidental):
   - which files have TODO/stub markers
   - what's left to finish
3. Tell the user: "Completion gate overridden for the next stop. Run /handoff if you want a
   context capsule so you can resume cheaply."

The marker is consumed on the next stop (the hook deletes it), so the gate re-arms
automatically for the following turn.
