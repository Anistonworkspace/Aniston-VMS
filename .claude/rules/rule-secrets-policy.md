---
# Secrets and Release Artifacts Policy

NEVER commit these files:
  .env, .env.*, .env.local, .env.production
  *.jks, *.keystore (Android signing)
  google-services.json, GoogleService-Info.plist
  *.apk, *.aab (Android build artifacts)
  *.ipa (iOS build artifacts)
  *.exe, *.msi (Windows installers)
  Any file containing a hardcoded API key, password, or token

Where secrets go:
  Local development: .env file (git-ignored)
  CI/CD: GitHub Actions secrets (Settings → Secrets and Variables)
  Production: environment variables on the server — never in the repo

Build artifacts:
  APK/AAB: built by CI and delivered to EC2 via SCP — never committed to git
  EXE/IPA: same — artifacts live in the release pipeline, not in source control

If a secret is accidentally committed:
  1. Rotate the secret IMMEDIATELY (before anything else)
  2. Use git filter-repo to purge it from git history
  3. Force-push the cleaned history (the one exception to the no-force-push rule)
  4. Notify the team

The .gitignore MUST always include:
  .env, .env.*, *.jks, *.keystore, *.apk, *.aab, node_modules/, uploads/, dist/
