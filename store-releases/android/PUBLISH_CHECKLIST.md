# Android — Pre-publish Checklist

Before uploading to Google Play Console (or distributing the APK):

## Code & content
- [ ] Version bumped in `frontend/package.json` (semver)
- [ ] `CHANGELOG.md` (or in-app changelog) updated with user-facing changes
- [ ] No `console.log` / `debugger` left in production builds
- [ ] All Capacitor plugins listed in `frontend/capacitor.config.ts` are needed (remove unused)
- [ ] Permissions in `frontend/android/app/src/main/AndroidManifest.xml` minimized — every requested permission has a justification on the Play Console listing

## Branding & icons
- [ ] All app icon densities present in `frontend/android/app/src/main/res/mipmap-*`
- [ ] Adaptive icon (foreground + background) configured
- [ ] Splash screen configured in `frontend/android/app/src/main/res/drawable/splash.xml`
- [ ] Status bar color matches brand (indigo-600)

## Signing & secrets
- [ ] `.keystore-env` is filled in locally, NOT committed
- [ ] Release keystore backed up in 2 secure locations (lost keystore = lost ability to push updates)
- [ ] CI environment has the same secrets set under different names (GitHub Actions secrets)
- [ ] APK verified signed: `apksigner verify --print-certs app-release.apk`
- [ ] AAB verified: `bundletool validate --bundle=app-release.aab`

## Functional QA
- [ ] Login flow works on real Android device (not just emulator)
- [ ] Offline mode shows `offline.html` correctly
- [ ] Push notifications (if used) deliver and tap-through correctly
- [ ] Deep links (if used) route to the correct screen
- [ ] App handles back-button correctly (doesn't accidentally close from non-root screens)
- [ ] Tested on Android 10, 12, 14 minimum
- [ ] Tested on entry-level device (3GB RAM or less) — glassmorphism perf check

## Play Console listing
- [ ] Title (max 30 chars)
- [ ] Short description (max 80 chars)
- [ ] Full description (max 4000 chars)
- [ ] Feature graphic 1024×500
- [ ] At least 2 phone screenshots (1080×1920 or similar)
- [ ] Privacy policy URL
- [ ] Data safety form filled in honestly (every SDK that collects data declared)
- [ ] Content rating questionnaire completed
- [ ] Target audience age range
- [ ] App category set

## Pre-release rollout
- [ ] Upload to **Internal testing** track first
- [ ] Test with the internal testers list (yourself, dev team)
- [ ] Promote to **Closed testing** for broader QA
- [ ] Promote to **Open testing** if desired
- [ ] Finally promote to **Production** with staged rollout (start at 5-10%)

## After publish
- [ ] Tag the git commit: `git tag android-v<version> && git push --tags`
- [ ] Update `memory/changes/YYYY-MM-DD-changes.md` with the release entry
- [ ] Monitor Play Console crash reports for first 48 hours
- [ ] If crash-free rate drops below 99% → halt rollout
