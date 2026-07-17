---
name: release-check
description: Pre-release quality gate. Run before any production deploy or store submission. Checks code quality, test coverage, security, and release artifacts.
---

This is the final gate before a production release. All items must pass.

**Code quality**
- [ ] TypeScript compiles with no errors in backend and frontend
- [ ] ESLint passes with no errors (warnings are acceptable)
- [ ] No console.log or debugger statements in production code

**Tests**
- [ ] All Vitest tests pass: npm test
- [ ] All Playwright E2E tests pass: npm run test:e2e
- [ ] Coverage meets thresholds: backend service ≥ 80%, utilities ≥ 90%

**Security**
- [ ] Run /security-scan and confirm no CRITICAL or HIGH findings
- [ ] No hardcoded secrets in the codebase
- [ ] .env not committed to git

**Database**
- [ ] All migrations applied in staging environment
- [ ] Migration tested on a clone of production data
- [ ] Rollback migration tested

**Performance**
- [ ] No new N+1 queries introduced
- [ ] Lighthouse score ≥ 85 for Performance, Accessibility, Best Practices

**Mobile/PWA**
- [ ] PWA installs correctly on Android Chrome
- [ ] Offline fallback (offline.html) works
- [ ] Layout tested at 375px — no overflow

**Release artifacts (if shipping to stores)**
- [ ] Android: see store-releases/android/PUBLISH_CHECKLIST.md
- [ ] iOS: see store-releases/ios/PUBLISH_CHECKLIST.md
- [ ] Windows EXE: see store-releases/electron/PUBLISH_CHECKLIST.md

**Git hygiene**
- [ ] Version bumped in package.json
- [ ] CHANGELOG.md updated
- [ ] Git tag created: git tag v<version>

Only proceed to deploy after all items are checked.
