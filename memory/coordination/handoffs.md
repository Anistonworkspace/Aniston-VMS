# Agent Handoffs

When one agent stops partway through a task and needs another agent (or a future fresh chat) to pick up, the handoff is recorded here.

## Handoff format

```markdown
## YYYY-MM-DD HH:MM — from `<source-agent>` to `<target-agent or "next-agent">`

**Task:** <one-line summary>
**Plan:** [../plans/_active/<plan>.md](../plans/_active/<plan>.md)
**Done so far:**
- Step 1 ✅
- Step 2 ✅
- Step 3 ⏳ in progress — stopped because <reason>

**Next concrete action:**
> <what the next agent should do FIRST, with exact files/lines>

**Watch out for:**
- <gotchas, hidden constraints, files NOT to touch>

**Verification when complete:**
- `<command or check>`

**Status:** OPEN | PICKED-UP YYYY-MM-DD by <agent> | COMPLETED YYYY-MM-DD
```

## Open handoffs

_(none — no in-flight handoffs)_

## Recently completed

_(none yet)_
