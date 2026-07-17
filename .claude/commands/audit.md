---
name: audit
description: Run a full 10-dimension enterprise audit of the current codebase. Reports findings across logic, security, data, frontend wiring, performance, observability, DevOps, mobile/PWA, testing, and compliance.
---

Runs a deep audit across all 10 dimensions defined in rule-audit-standards.md.

Launch these agents in parallel:

1. agent-logic-analyzer — business logic, state machines, race conditions, edge cases
2. agent-api-security — RBAC, IDOR, middleware order, rate limits, validation
3. agent-database — schema correctness, enum sync, index coverage, migration safety
4. agent-frontend-wiring — dead buttons, unwired mutations, stale state, API mismatch
5. agent-performance — N+1 queries, missing indexes, unpaginated endpoints, bundle size
6. agent-observability — structured logs, audit trails, health checks, job failures
7. agent-devops — CI/CD, Docker, deploy scripts, rollback plans
8. agent-ui-ux — mobile layout, PWA, accessibility, glassmorphism consistency
9. agent-testing — coverage gaps, missing RBAC tests, missing E2E tests
10. agent-security — OWASP Top 10, JWT, encryption, secrets, file uploads, CORS

After all 10 agents complete:
- Aggregate all findings into a single report
- Group by severity: CRITICAL → HIGH → MEDIUM → LOW
- Calculate an overall score per dimension (0–10) and a total score
- Produce a prioritized fix list: P0 items first, then P1, then P2

Output the final report to the chat and optionally save it to memory/changes/YYYY-MM-DD-audit.md.
