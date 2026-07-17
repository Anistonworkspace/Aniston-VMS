# Prompt Log

A daily-rotating log of prompts an agent received. One file per UTC day, named `YYYY-MM-DD-prompts.md`.

## When to write

Append to today's file when:

- The user gives a non-trivial instruction
- Another agent hands off a task via [../coordination/handoffs.md](../coordination/handoffs.md)
- The user makes a decision worth preserving (e.g. "we won't support iOS for v1")

Skip for:

- Conversational small talk
- Quick clarifications already captured in a plan
- Status questions ("are tests passing?")

## Entry format

```markdown
## HH:MM — <agent or "user">

**Prompt summary:** <one-line distillation>

**Verbatim (if short):**
> <the original text>

**Action taken:** <what was done, with file refs if applicable>

**Plan reference:** [../plans/_active/...](../plans/_active/...) (if a plan was created)
```

## Why

A persistent prompt log lets future agents trace decisions back to the moment they were made — invaluable when "why is this here?" comes up months later, and git blame only shows the code change.
