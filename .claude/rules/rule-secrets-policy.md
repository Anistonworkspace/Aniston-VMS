---
# Secrets and Release Artifacts Policy
Canon: memory/alignment-dictionary.md, docs/02-TRD.md.

NEVER commit these files:
  .env, .env.*, .env.local, .env.production
  *.jks, *.keystore (Android signing)
  google-services.json, GoogleService-Info.plist
  *.apk, *.aab (Android build artifacts)
  *.ipa (iOS build artifacts)
  *.exe, *.msi (Windows installers)
  Any file containing a hardcoded API key, password, or token — including camera RTSP/ONVIF passwords,
  router/SIM credentials, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`

Where secrets go:
  Local development: .env file (git-ignored), one per app (`apps/api/.env`, `apps/workers/.env`)
  CI/CD: GitHub Actions secrets (Settings → Secrets and Variables)
  Production: environment variables on the server — never in the repo

Application secrets specifically:
  `ENCRYPTION_KEY` (AES-256-GCM, 32 bytes) encrypts every `*Encrypted` field — camera RTSP/ONVIF credentials,
  SIM PINs, third-party API keys. Rotate it via the documented re-encryption migration, never in place.
  `JWT_SECRET` / `JWT_REFRESH_SECRET` sign access/refresh tokens — rotating either invalidates all sessions.
  `DATABASE_URL` / `REDIS_URL` connect Prisma/PostgreSQL and BullMQ — never log these, even at debug level.
  MediaMTX (`services/media`) and the image-analysis service (`services/image-analysis`) each get their own
  service-to-service credential — never reuse the end-user JWT secret for service-to-service auth.

Build artifacts:
  APK/AAB: built by CI and delivered to EC2 via SCP — never committed to git
  EXE/IPA: same — artifacts live in the release pipeline, not in source control

If a secret is accidentally committed:
  1. Rotate the secret IMMEDIATELY (before anything else) — for `ENCRYPTION_KEY` this also means
     re-encrypting every `*Encrypted` field with the new key before decommissioning the old one
  2. Use git filter-repo to purge it from git history
  3. Force-push the cleaned history (the one exception to the no-force-push rule)
  4. Notify the team

The .gitignore MUST always include:
  .env, .env.*, *.jks, *.keystore, *.apk, *.aab, node_modules/, uploads/, dist/