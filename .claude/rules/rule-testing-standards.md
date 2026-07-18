---
# Testing Standards
Canon: memory/alignment-dictionary.md, docs/06-implementation-plan.md.

Coverage requirements (CI will fail below these):
  Backend service layer: >= 80% line coverage
  Utility functions: >= 90% line coverage
  Frontend critical components (auth, forms, incident/live-wall views): >= 70% line coverage

Required unit tests (write these for every module):
  Every service method: happy path + main error path
  All calculation functions (e.g. camera health scoring, escalation SLA countdown)
  Encryption round-trip (encrypt → decrypt → same value) for every `*Encrypted` field (camera RTSP/ONVIF
  credentials, SIM PINs, API keys)
  State machine transition guards (valid and invalid transitions) for `CameraStatus` and `IncidentStatus`

Required integration tests (write these for every API):
  Every API endpoint: happy path + auth error + validation error
  Full auth flow: register → login → refresh → logout
  Full primary business workflows end-to-end at the service layer (e.g. health-check ingestion → Incident
  creation → Escalation → Notification)

Required E2E tests (Playwright — write these for every user-facing flow):
  Login + role-based redirect (SUPER_ADMIN, PROJECT_ADMIN, CLIENT_VIEWER each land on the right page)
  Primary user workflows: viewing the live wall, acknowledging an incident, reviewing a recording clip
  Public forms (contact, signup)
  PWA install prompt appears

RBAC + zone-scope test matrix:
  For every critical route, test all 3 roles (SUPER_ADMIN, PROJECT_ADMIN, CLIENT_VIEWER)
  For PROJECT_ADMIN and CLIENT_VIEWER, additionally test in-scope vs out-of-scope zone/site/camera access
  3 roles × critical routes × in/out-of-scope = minimum number of RBAC test cases
  Any role or scope that should be denied must return 403, not 200

CI gate:
  All tests must pass before a PR can be merged
  Coverage must meet the above thresholds
  No exceptions — fix the tests or fix the code