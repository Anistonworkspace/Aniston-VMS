# ADR-0005 — Capacitor over React Native for Mobile

**Date:** 2026-05-20
**Status:** Accepted
**Deciders:** Aniston Technologies LLP

---

## Context

The boilerplate needs a mobile (Android APK/IPA) delivery path for the React frontend.

Options evaluated:
1. **Capacitor** — wraps existing Vite/React web app in a native shell
2. **React Native** — separate native codebase sharing only business logic
3. **PWA only** — no native app, just service worker
4. **Flutter** — separate Dart codebase entirely

---

## Decision

Use **Capacitor** to wrap the existing React app.

---

## Rationale

| Criterion | Capacitor | React Native | PWA only |
|-----------|-----------|-------------|----------|
| Code reuse from web | ✅ 100% same codebase | ⚠️ ~50% (logic only) | ✅ 100% |
| App store distribution | ✅ | ✅ | ❌ (limited) |
| Native APIs (camera, push) | ✅ via plugins | ✅ native | ⚠️ limited |
| Team skills needed | Web (existing) | React Native specialist | Web (existing) |
| Build time | Fast (web build + cap sync) | Slow (native compilation) | Instant |
| Performance | Good (WebView) | Excellent (native) | Good |
| Offline support | ✅ (Workbox PWA) | ✅ | ✅ |

The team builds web-first. Capacitor lets the same React/Vite codebase ship as a web app, PWA, and native mobile app with no separate codebase to maintain.

React Native was rejected because it requires a separate codebase, separate component library, and a developer with React Native expertise — adding significant maintenance burden for what is primarily a web application.

---

## Consequences

- One `npm run build` + `npx cap sync` produces the web assets for both Android and iOS
- Native APIs accessed via `@capacitor/*` plugins (Camera, PushNotifications, Network, App)
- `Capacitor.isNativePlatform()` used to gate native-only code paths
- Keystore and signing certificates in GitHub Secrets — never committed
- APK/AAB artifacts built in CI, uploaded to Play Console or EC2 — never in git
- Safe area insets handled with `env(safe-area-inset-*)` CSS variables

## How to apply

Read `skill-capacitor-patterns.md` before adding any Capacitor-specific code.
Always check `Capacitor.isNativePlatform()` before calling any `@capacitor/*` plugin.
