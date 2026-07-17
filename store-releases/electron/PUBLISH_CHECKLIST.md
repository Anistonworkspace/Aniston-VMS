# Electron Windows — Pre-publish Checklist

Before distributing the EXE installer to users or uploading to a release channel:

## Code & content
- [ ] Version bumped in `package.json` (root or `agent-desktop/package.json`)
- [ ] `CHANGELOG.md` updated with user-facing changes
- [ ] No `console.log` / `debugger` left in production builds
- [ ] Auto-updater feed URL pointing to production (not staging)
- [ ] Backend API URL hardened to production endpoint

## Build environment
- [ ] Built on a clean working tree (no uncommitted changes)
- [ ] Built from a tagged commit on `main`
- [ ] Node.js version matches `.nvmrc` / `engines` field
- [ ] `npm ci` used (not `npm install`) in CI to ensure lockfile fidelity

## Code signing
- [ ] EV or OV code-signing certificate loaded (`WINDOWS_CERT_FILE` / `WINDOWS_CERT_PASSWORD`)
- [ ] Certificate not expiring within 60 days
- [ ] Signed installer verified: `signtool verify /pa /v "BoilerplateAgent Setup <version>.exe"`
- [ ] SmartScreen reputation: new certs show a warning for ~weeks of user trust — prepare support comms

## Functional QA
- [ ] Fresh install works on Windows 10 and Windows 11
- [ ] Upgrade install works over previous version (no file conflicts)
- [ ] Silent install works: `BoilerplateAgent Setup.exe /S`
- [ ] App launches to system tray on startup if autolaunch enabled
- [ ] WebSocket connection to backend established within 5 seconds
- [ ] Activity tracking (if applicable) works correctly with UAC
- [ ] Uninstaller removes all files (no leftover AppData artifacts unless intended)
- [ ] Tested on a machine without admin rights (standard user account)

## Auto-updater
- [ ] `electron-updater` configured with correct `publish` channel in `package.json`
- [ ] Update check fires within 60 seconds of app launch
- [ ] Update downloads in background (silent) and prompts user to restart
- [ ] Staged rollout possible — rollout percentage configured in feed if using S3/GitHub releases
- [ ] Rollback: previous installer retained; users can re-install older version

## Security
- [ ] `contextIsolation: true` in all BrowserWindow instances
- [ ] `nodeIntegration: false` in all renderer processes
- [ ] `webSecurity: true` (never disabled in production)
- [ ] No remote `eval` or `executeJavaScript` from untrusted content
- [ ] IPC channels audited — only expected channels exposed via preload

## Distribution channel
- [ ] GitHub Releases: tag `electron-v<version>`, upload EXE + RELEASES.json
- [ ] (Optional) S3 bucket: upload EXE + latest.yml for auto-updater feed
- [ ] (Optional) Internal MDM / SCCM deployment package prepared
- [ ] SHA-256 checksum published alongside installer

## After publish
- [ ] Tag the git commit: `git tag electron-v<version> && git push --tags`
- [ ] Update `memory/changes/YYYY-MM-DD-changes.md` with the release entry
- [ ] Announce release in internal comms (Slack, email)
- [ ] Monitor crash reports / Sentry for first 48 hours
- [ ] If critical bug found: yank the release from GitHub, push a hotfix
