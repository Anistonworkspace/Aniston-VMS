---
name: fix-critical
description: Fix a P0 or P1 critical bug using the safe fix process. Writes a plan, implements the fix, and verifies it before marking done.
---

When invoked, follow this process exactly:

**Step 1 — Understand the bug**
- Get the full error message, stack trace, and steps to reproduce
- Identify the severity: P0 (production down / data loss) or P1 (major feature broken / security issue)

**Step 2 — Write a fix plan**
Create memory/plans/_active/YYYY-MM-DD-fix-<slug>.md with:
- Severity (P0 or P1)
- Module affected
- Exact files to modify with line numbers
- Whether a database migration is needed
- What data is at risk
- The fix description (what changes and why)
- Test plan (unit test + manual test + regression check)
- Rollback plan (how to undo the fix)
- Validation command

For P0: confirm the rollback plan is ready BEFORE writing any code.

**Step 3 — Implement the minimal fix**
- Change only what is necessary to fix the bug
- Do not refactor, rename, or clean up anything else
- Do not add features

**Step 4 — Verify**
- Run the validation command from the plan
- Run the full test suite: `pnpm test` (target the affected workspace, e.g. `pnpm --filter @aniston-vms/api test`)
- Test manually using the steps to reproduce — confirm bug is gone

**Step 5 — Write a unit test**
- P0: required even in emergency — code review happens before any deploy
- P1: required before the fix is merged

**Step 6 — Update memory**
Run /done to save the completed plan and log the fix in memory/changes/.
