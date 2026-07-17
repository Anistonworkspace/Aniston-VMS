# Change Log

Daily-rotating log of code changes made by agents or the user. One file per UTC day, named `YYYY-MM-DD-changes.md`.

This complements `git log` rather than duplicating it. Use this for **the why** (linking the change to a plan, ADR, or user request). `git log` covers **the what**.

## Entry format

```markdown
## HH:MM — <agent or "user">

**Change:** <short description>
**Files:** `path/a.ts`, `path/b.ts`
**Reason:** <link to plan, ADR, or user prompt>
**Tests added/updated:** <yes/no, list>
**Verified by:** <command run or manual check>
```

## When NOT to log here

- Trivial refactors (rename a local var, fix a typo)
- Auto-formatting changes
- Anything covered by a commit message already linked from a plan

## Audit rule

If `changes/` is missing a day where commits happened, the agent on duty next should reconstruct the missing entries from `git log` so the audit trail stays intact.
