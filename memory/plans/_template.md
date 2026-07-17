# Plan: <one-line title>

**Created:** YYYY-MM-DD HH:MM
**Owner agent:** <agent-name or "user">
**Status:** active | blocked | complete | abandoned
**Linked to:** [project-state.md](../project-state.md), [issue/PR if any]

## Goal

<1-2 sentences: what problem this plan solves, and what "done" looks like>

## Context

<What you know about the current state. Reference specific files/lines.>

## Steps

- [ ] Step 1 — <action>
  - Files touched: `path/to/file.ts:L1-L42`
  - Verification: <test command or manual check>
- [ ] Step 2 — <action>
  - Files touched: ...
  - Verification: ...

## Migration / data impact

<Yes/no. If yes: what migrates, rollback plan, backup needed?>

## Rollback plan

<Specific commands or steps to undo this work if it goes wrong.>

## Test plan

- Unit tests to add/update: ...
- Integration tests to add/update: ...
- Manual smoke check: ...

## Acceptance criteria

- [ ] All steps executed
- [ ] Tests pass
- [ ] No regressions in: <list affected areas>
- [ ] Updated [project-state.md](../project-state.md)
- [ ] Logged in today's [changes](../changes/) file
- [ ] Moved this file to `plans/_archive/` with completion date appended to filename

## Notes / handoff

<If you stopped partway, write here what the next agent should know. Reference any related entries in [coordination/handoffs.md](../coordination/handoffs.md).>
