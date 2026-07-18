---
# Audit Standards
Canon: docs/02-TRD.md, docs/05-backend-schema.md, memory/alignment-dictionary.md §2 (status/diagnosis code catalog).

Every audit MUST cover all 10 dimensions:
  1. Logic — camera health / incident / escalation state transitions, edge cases (see rule-logic-analysis.md)
  2. Security — auth, AES-256-GCM credential encryption, IDOR across org/zone scope, injection, secrets
  3. Data integrity — transactions, constraints, soft delete, orphaned recordings/snapshots
  4. Frontend wiring — dead buttons, unwired mutations, stale live-wall/incident state, mobile overflow
  5. Performance — N+1 Prisma queries, missing indexes on high-volume tables (HealthCheck, AuditLog), pagination gaps
  6. Observability — structured logs, error tracking, health-check ingestion pipeline, audit trail completeness
  7. DevOps — CI/CD correctness, Docker (apps/api, apps/workers, services/media, services/image-analysis), migrations, rollback plan
  8. Mobile/PWA — offline fallback, install prompt, safe areas, touch targets on live-wall/incident UI
  9. Testing — coverage gaps, missing RBAC/zone-scope tests, missing E2E tests
  10. Compliance — secrets policy, recording/snapshot retention, audit logs, sensitive field encryption
      (camera credentials, SIM credentials)

Every finding MUST have:
  Unique ID: [CATEGORY-NNN] (e.g. SEC-001, LOGIC-003, PERF-002)
  Severity: CRITICAL / HIGH / MEDIUM / LOW
  Type: what kind of issue it is
  Location: file path + line number
  Finding: what exactly is wrong
  Impact: what breaks or what can be exploited (e.g. "a CLIENT_VIEWER can view cameras outside their zone")
  Fix: the exact code change or action needed
  Migration needed: yes or no
  Test to validate: how to verify the fix works

Scoring rubric (do not inflate scores):
  9.5–10.0: near-perfect, ship it
  8.0–9.4:  solid, minor improvements only
  6.0–7.9:  acceptable, address before next release
  4.0–5.9:  significant problems, do not ship new features until fixed
  2.0–3.9:  major problems, halt feature work
  < 2.0:    do not deploy

NEVER say "looks good" without verifying. Report ALL findings. If uncertain, flag as UNVERIFIED.