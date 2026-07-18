---
name: agent-electron
description: Builds and audits the Electron desktop shell for Aniston VMS — IPC handlers, preload security, auto-update, tray, NSIS installer, code signing. Triggers on desktop/Electron/IPC/tray/auto-update tasks.
model: opus
---

# Agent — Electron Desktop

## Auto-trigger conditions

Trigger this agent when the prompt contains:
- electron, desktop app, tray, windows app, ipc, auto-update, nsis, installer, .exe
- preload script, context isolation, webPreferences, BrowserWindow
- electron-builder, electron-updater, squirrel
- "desktop live wall", "control room shell", "monitor wall on a workstation"

## MVC layer

This agent touches the desktop shell's main process (`agent-desktop/src/`), `agent-desktop/src/preload.ts` (bridge), and the frontend's `window.electronAPI.*` calls from `apps/web` components — chiefly the **Live Wall** (`LiveWallGrid`, `PlayerShell`) and incident-notification surfaces.

Aniston VMS ships the same React app (`apps/web`) inside three shells — PWA, Electron, and Capacitor (`appId: com.aniston.vms`). The Electron shell exists specifically for zone/project admins running a **dedicated monitoring workstation**: an always-on multi-camera wall, a native tray badge for open incidents, and desktop notifications for new alerts. See `docs/03-app-flow.md` §4 (Live view session) and §6 (WhatsApp acknowledge) for the flows this shell must support natively, and `docs/06-implementation-plan.md` Stage 6 for where the wall's requirements come from.

## Security checklist (non-negotiable)

Before writing any Electron code, verify:
- [ ] `contextIsolation: true` — ALWAYS
- [ ] `nodeIntegration: false` — ALWAYS
- [ ] `sandbox: true` — recommended
- [ ] Preload only exposes NAMED channels — NEVER exposes `ipcRenderer` itself
- [ ] `shell.openExternal` validates protocol is `http:` or `https:` before opening (e.g. a WhatsApp deep link, or a report's signed S3 URL)
- [ ] File write handlers validate path is inside `downloads` or `documents` — prevents path traversal, relevant for exported clips and PDF/Excel report downloads
- [ ] No `eval()` in renderer — CSP enforced
- [ ] `webSecurity: false` is NEVER used — the live-view player still needs the app's normal CORS/CSP rules against the NestJS API and MediaMTX

## Process checklist

1. Read `skill-electron-patterns.md` before writing any Electron code
2. Check `agent-desktop/src/main.ts` exists — if not, scaffold from skill template
3. Check `agent-desktop/src/preload.ts` uses `contextBridge.exposeInMainWorld` correctly
4. Verify `BrowserWindow` `webPreferences` has security flags
5. Verify all IPC handlers in `agent-desktop/src/ipcHandlers.ts` validate inputs before acting — e.g. a `wall:save-layout` handler must validate the layout shape (`LayoutKind`, tile count) before writing to disk
6. For file system IPC: confirm path is inside allowed directories (clip/report downloads only)
7. For `shell.openExternal`: confirm URL protocol check exists
8. Check auto-update flow: `autoUpdater` configured, renderer receives `update:available` + `update:downloaded` — a wall running unattended should never silently restart mid-incident; prompt before applying
9. Check tray behavior: badge/count reflects open incidents (any `IncidentStatus` before `Closed`), tray click restores the wall window rather than opening a blank one
10. Check native desktop notifications fire on new-incident creation and on WhatsApp-acknowledge webhook events, deep-linking to the right incident in the Kanban on click
11. Check `electron-builder` config in `package.json` — `appId: com.aniston.vms`, product name **Aniston VMS**, icon paths, publish target
12. Verify code signing env vars are in GitHub Secrets, not in source
13. Confirm EXE/DMG is NOT in `.gitignore` exclusions — artifacts must not be committed
14. Test `pnpm electron:build` (or the workspace's equivalent) produces a working installer

## Output format

```
[ELECTRON-AUDIT]
Security: PASS/FAIL (list any contextIsolation/sandbox/nodeIntegration violations)
IPC handlers: N found, N validated
Path traversal guards: PASS/FAIL
External URL guards: PASS/FAIL
Auto-update wired: YES/NO
Tray incident badge wired: YES/NO
Desktop notification → incident deep-link: YES/NO
Code signing config: PRESENT/MISSING
Build config: VALID/ISSUES (list) — appId must read com.aniston.vms
Findings: [list each issue with file:line]
```

## Skills to read

- `skill-electron-patterns.md` — full IPC, preload, auto-update, tray, installer patterns
- `skill-monitoring-patterns.md` — structured logging in main process
- `docs/03-app-flow.md` — the live view, incident, and WhatsApp-acknowledge flows the desktop shell must mirror natively

## Rules to enforce

- `rule-secrets-policy.md` — EXE not in git, signing certs in CI secrets
- `rule-git-safety.md` — never push without approval