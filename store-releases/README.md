# Store Releases

Build artifacts for distributing the app outside the browser PWA. Each target has its own directory with build scripts and a publish checklist.

## Target matrix

| Target | Artifact | Output dir | Signing | Used for |
|---|---|---|---|---|
| Android (Play Store) | `.aab` | `android/build/outputs/bundle/release/` | Release keystore | Play Console upload |
| Android (sideload / internal) | `.apk` | `android/build/outputs/apk/release/` | Release keystore | Direct install, beta testers |
| iOS (App Store) | `.ipa` | `ios/build/` | Distribution certificate + provisioning profile | App Store Connect upload |
| Windows desktop (activity agent) | `.exe` (NSIS installer) | `electron/dist/` | Code-signing certificate | Direct download / MDM rollout |

## Source flow

```
frontend/  (PWA — browser experience, always primary)
     │
     ├── npx cap copy android  ────► android/  (Capacitor wrapper)  ────► APK / AAB
     ├── npx cap copy ios      ────► ios/      (Capacitor wrapper)  ────► IPA
     │
agent-desktop/  (Electron — Windows activity tracker, separate app)
                                                                    ────► EXE
```

The browser PWA is the source of truth for UI. Android and iOS are Capacitor wrappers around the same dist bundle. The Electron app is a separate codebase in `agent-desktop/` (because it tracks system events the PWA can't).

## Build prerequisites

- **All targets**: `npm install` and `npm run build --workspace=frontend` succeed first
- **Android**: Java 17, Android Studio with SDK 34+, NDK 25+, release keystore present (env-driven path)
- **iOS**: macOS host, Xcode 15+, Apple Developer account, distribution certificate + provisioning profile installed
- **Electron (Windows)**: Node 20+, Windows host (or wine + nsis on Linux), code-signing certificate

## Signing & secrets policy

NEVER commit any of:
- `*.jks`, `*.keystore` (Android)
- `*.p12`, `*.mobileprovision`, `*.cer` (iOS)
- `*.pfx`, `*.p7b` (Windows)
- `google-services.json` (Android Firebase config)
- `GoogleService-Info.plist` (iOS Firebase config)

All certificates and signing material live in GitHub Actions secrets (or the user's local secret manager) and are decoded at build time. Templates for the expected env vars are in each subdirectory's `.keystore-env.template` or equivalent.

## Reproducibility

Each build script:
1. Logs the exact git SHA being built
2. Writes a `build-manifest.json` next to the artifact (commit, build time, builder, source PWA hash)
3. Fails loudly if working tree is dirty (override with `--allow-dirty` flag only for debug builds)

## Versioning

App version comes from `frontend/package.json`'s `version` field. Build scripts read it and write to:
- `android/app/build.gradle` → `versionName` and `versionCode`
- `ios/App/App/Info.plist` → `CFBundleShortVersionString` and `CFBundleVersion`
- `agent-desktop/package.json` is independent (desktop agent has its own version cadence)
