# Skill — Electron Desktop Patterns (Control-Room Live-Wall Shell)

`agent-desktop/` wraps the same `apps/web` React app in a native shell for a control-room PC:
fullscreen multi-monitor live-wall display, minimize-to-tray so the wall keeps running unattended,
and native save/export dialogs for snapshots and clip exports. Electron/Capacitor are **not**
required for Aniston VMS v1 — the primary target is the web SPA (see
`docs/tech-stack-targets.md` "Deferred targets") — but the pattern and release tooling
(`store-releases/electron/`) already exist in this repo, so build it correctly when a control room
asks for a dedicated kiosk machine instead of a browser tab.

IPC surface: `main.ts` (window/tray/lifecycle), `preload.ts` (contextBridge — the only thing the
renderer may call), `ipcHandlers.ts` (file dialogs), `updater.ts` (electron-updater), `tray.ts`
(system tray). Renderer code is the normal `apps/web` React app — never give it `nodeIntegration`.

---

## Entry point (`agent-desktop/src/main.ts`)

```typescript
import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import { setupIpcHandlers } from './ipcHandlers';
import { setupAutoUpdater } from './updater';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1280,
    minHeight: 720,
    title: 'Aniston VMS — Live Wall',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // REQUIRED for security — renderer has zero Node access
      nodeIntegration: false, // REQUIRED — this window loads remote-ish (proxied API) content
      sandbox: true,
    },
  });

  const isDev = process.env.NODE_ENV === 'development';
  mainWindow.loadURL(isDev ? 'http://localhost:5173' : `file://${path.join(__dirname, '../dist/index.html')}`);

  mainWindow.on('close', (event) => {
    // Closing the window ≠ quitting: the live wall keeps monitoring from the tray
    if (!(app as any).isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../assets/tray-icon.png'));
  tray = new Tray(icon);
  tray.setToolTip('Aniston VMS');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Live Wall', click: () => mainWindow?.show() },
      { label: 'Check for Updates', click: () => setupAutoUpdater(mainWindow!) },
      { type: 'separator' },
      { label: 'Quit', click: () => { (app as any).isQuitting = true; app.quit(); } },
    ]),
  );
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  setupIpcHandlers();
  setupAutoUpdater(mainWindow!);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

`contextIsolation: true` + `nodeIntegration: false` + `sandbox: true` are non-negotiable — this
window ultimately renders our own web app pointed at the live NestJS API (`apps/api`) URL; treat it like any other
renderer with network-controlled content.

---

## Preload bridge (`agent-desktop/src/preload.ts`)

Expose only the specific, named channels the live-wall UI actually needs — never `ipcRenderer`
itself.

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  saveSnapshot: (dataUrl: string, suggestedName: string) =>
    ipcRenderer.invoke('dialog:save-snapshot', dataUrl, suggestedName),
  saveClipExport: (filePath: string, suggestedName: string) =>
    ipcRenderer.invoke('dialog:save-clip', filePath, suggestedName),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  onUpdateAvailable: (cb: () => void) => ipcRenderer.on('update:available', cb),
  onUpdateDownloaded: (cb: () => void) => ipcRenderer.on('update:downloaded', cb),
  installUpdate: () => ipcRenderer.invoke('update:install'),
});
```

`apps/web` code checks `window.electronAPI?.isElectron` to branch between "download in browser"
(web SPA) and "native save dialog" (desktop shell) for snapshot/clip export — same component,
same `<ExportButton />`, different side effect.

## IPC handlers (`agent-desktop/src/ipcHandlers.ts`)

```typescript
import { ipcMain, dialog, shell, app, BrowserWindow } from 'electron';
import fs from 'node:fs/promises';

export function setupIpcHandlers() {
  ipcMain.handle('app:get-version', () => app.getVersion());

  ipcMain.handle('dialog:save-snapshot', async (event, dataUrl: string, suggestedName: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)!;
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Save camera snapshot',
      defaultPath: suggestedName,
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
    });
    if (canceled || !filePath) return null;
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    await fs.writeFile(filePath, base64, 'base64');
    return filePath;
  });

  ipcMain.handle('shell:open-external', (_event, url: string) => shell.openExternal(url));
}
```

## Auto-updater (`agent-desktop/src/updater.ts`)

```typescript
import { autoUpdater } from 'electron-updater';
import { BrowserWindow } from 'electron';

export function setupAutoUpdater(mainWindow: BrowserWindow) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', () => mainWindow.webContents.send('update:available'));
  autoUpdater.on('update-downloaded', () => mainWindow.webContents.send('update:downloaded'));
  autoUpdater.checkForUpdates();
}
```

Render an `<ElectronUpdateBanner />` in `apps/web` (guarded by `window.electronAPI?.isElectron`)
that listens for these two events and offers "Restart to update" — a live wall shouldn't restart
itself silently mid-shift.

---

## Build config (`agent-desktop/package.json` → `build` block, electron-builder)

```json
{
  "name": "agent-desktop",
  "productName": "Aniston VMS",
  "build": {
    "appId": "com.aniston.vms",
    "productName": "Aniston VMS",
    "directories": { "output": "dist" },
    "files": ["dist/**/*", "assets/**/*"],
    "win": {
      "target": "nsis",
      "icon": "assets/icon.ico",
      "certificateFile": "${env.WINDOWS_CERT_FILE}",
      "certificatePassword": "${env.WINDOWS_CERT_PASSWORD}"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true
    },
    "mac": { "target": "dmg", "icon": "assets/icon.icns" },
    "linux": { "target": "AppImage", "icon": "assets/icon.png" }
  }
}
```

Windows code signing uses `WINDOWS_CERT_FILE` / `WINDOWS_CERT_PASSWORD` (mapped from GitHub
Secrets `CSC_LINK` / `CSC_KEY_PASSWORD` in `store-releases/electron/build-electron.ps1` and
`.github/workflows/release-electron.yml`) — never commit the certificate.

---

## Checklist before shipping a desktop-shell change

- [ ] `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on every `BrowserWindow`
- [ ] Only named channels exposed via `contextBridge` — never the raw `ipcRenderer`
- [ ] Closing the main window hides to tray, it does not kill the live-wall session
- [ ] `productName` / `appId` are **Aniston VMS** / `com.aniston.vms`, not boilerplate values
- [ ] Auto-updater never force-restarts without an explicit operator confirmation
- [ ] Code-signing secrets referenced by env var only, never hardcoded