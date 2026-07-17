---
# Bug Fix Process Rules

Every fix plan MUST include:
  Severity: P0, P1, P2, or P3
  Module: which module/feature is affected
  Files to modify: exact file paths with line numbers
  Migration needed: yes or no
  Data at risk: what data could be corrupted or lost
  Fix description: what exactly changes and why
  Test plan: unit test + manual test steps + regression check
  Rollback plan: how to undo the fix if it causes more problems
  Validation command: the exact command to verify the fix works
  Estimated effort: time estimate

Severity levels and response time:
  P0 (production down, data loss): fix immediately, code review required even in emergency, rollback plan must be ready before deploying
  P1 (major feature broken, security issue): fix within 24 hours, unit test covering the bug required
  P2 (feature degraded but workaround exists): fix within current sprint
  P3 (cosmetic issue, minor inconvenience): fix in backlog order

Systemic issues:
  If the same bug pattern appears in multiple places, write ONE fix plan covering all instances
  Do not write a separate plan per instance — fix the root cause
