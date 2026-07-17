---
# Testing Standards

Coverage requirements (CI will fail below these):
  Backend service layer: >= 80% line coverage
  Utility functions: >= 90% line coverage
  Frontend critical components (auth, forms): >= 70% line coverage

Required unit tests (write these for every module):
  Every service method: happy path + main error path
  All calculation functions
  Encryption round-trip (encrypt → decrypt → same value)
  State machine transition guards (valid and invalid transitions)

Required integration tests (write these for every API):
  Every API endpoint: happy path + auth error + validation error
  Full auth flow: register → login → refresh → logout
  Full primary business workflows end-to-end at the service layer

Required E2E tests (Playwright — write these for every user-facing flow):
  Login + role-based redirect (each role lands on the right page)
  Primary user workflows (the feature the app is built around)
  Public forms (contact, signup)
  PWA install prompt appears

RBAC test matrix:
  For every critical route, test all 3 roles (SUPER_ADMIN, ADMIN, MEMBER)
  3 roles × critical routes = minimum number of RBAC test cases
  Any role that should be denied must return 403, not 200

CI gate:
  All tests must pass before a PR can be merged
  Coverage must meet the above thresholds
  No exceptions — fix the tests or fix the code
