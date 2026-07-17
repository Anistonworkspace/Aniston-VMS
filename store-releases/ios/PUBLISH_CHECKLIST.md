# iOS — Pre-publish Checklist

Before uploading to App Store Connect:

## Code & content
- [ ] Version bumped in `frontend/package.json` (semver)
- [ ] `CHANGELOG.md` updated with user-facing changes
- [ ] No `console.log` / `debugger` left in production builds
- [ ] All Capacitor plugins listed in `frontend/capacitor.config.ts` are needed (remove unused)
- [ ] Privacy manifest (`PrivacyInfo.xcprivacy`) present and accurate (required since iOS 17)

## Branding & icons
- [ ] App icon set present in `frontend/ios/App/App/Assets.xcassets/AppIcon.appiconset/`
- [ ] All required icon sizes generated (use `capacitor-assets generate`)
- [ ] Launch screen configured (`LaunchScreen.storyboard`)
- [ ] Status bar style set (`UIStatusBarStyle` in Info.plist)

## Permissions & capabilities
- [ ] Every `NSUsageDescription` in `Info.plist` has a clear, honest user-facing string
- [ ] Only permissions actually used are declared
- [ ] Required device capabilities listed under `UIRequiredDeviceCapabilities`

## Signing
- [ ] `ExportOptions.plist` present locally (copied from template, filled in) — NOT committed
- [ ] Distribution certificate valid and not expiring within 30 days
- [ ] App Store provisioning profile installed and not expired
- [ ] Bundle ID in Xcode project matches `com.anistontech.boilerplate`

## Functional QA
- [ ] Login flow works on a real iPhone (not just Simulator)
- [ ] Offline mode shows `offline.html` correctly
- [ ] Push notifications (if used) deliver and tap-through correctly
- [ ] Deep links (Universal Links) route to correct screen
- [ ] Tested on iOS 16, 17, and 18
- [ ] Tested on a smaller device (iPhone SE) — layout does not overflow
- [ ] Safe area insets handled (notch, Dynamic Island, home indicator)
- [ ] Tested on iPadOS if iPad support declared in `UIDeviceFamily`

## App Store Connect listing
- [ ] App name (max 30 chars)
- [ ] Subtitle (max 30 chars)
- [ ] Promotional text (max 170 chars)
- [ ] Description (max 4000 chars)
- [ ] Keywords (max 100 chars total)
- [ ] Support URL
- [ ] Marketing URL (optional)
- [ ] Privacy policy URL
- [ ] Screenshots: 6.7" (iPhone 15 Pro Max), 6.5" (iPhone 11 Pro Max), 5.5" (iPhone 8 Plus), 12.9" iPad Pro (if iPad)
- [ ] App preview video (optional but boosts conversion)
- [ ] Age rating questionnaire completed
- [ ] App category set (primary + optional secondary)
- [ ] In-app purchases / subscriptions configured if applicable

## App Review compliance
- [ ] No placeholder content in the build
- [ ] Login credentials for reviewer provided in App Review notes (if login required)
- [ ] Demo mode or test account created if applicable
- [ ] No references to other platform stores (Android, Play Store)
- [ ] No private API usage

## Pre-release phased rollout
- [ ] Upload IPA to App Store Connect via Transporter or Xcode
- [ ] Set release timing: manual or automatic after approval
- [ ] Enable **Phased Release** (7-day gradual rollout)
- [ ] Monitor TestFlight crash reports before submitting to review

## After publish
- [ ] Tag the git commit: `git tag ios-v<version> && git push --tags`
- [ ] Update `memory/changes/YYYY-MM-DD-changes.md` with the release entry
- [ ] Monitor App Store Connect crash reports for first 48 hours
- [ ] If crash rate spikes → remove build from sale, submit hotfix
