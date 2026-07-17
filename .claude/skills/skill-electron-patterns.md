# Skill — Electron Desktop Patterns

IPC main/renderer, auto-update, tray, file dialogs, Windows installer (NSIS).

---

## Electron entry point

```typescript
// agent-desktop/src/main.ts
import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';

const isDev  = process.env.NODE_ENV === 'development';
const ROOT   = path.join(__dirname, '..');

let mainWindow:    BrowserWindow | null = null;
let tray:          Tray | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:           1280,
    height:          800,
    minWidth:        900,
    minHeight:       600,
    show:            false,    // show only when ready
    titleBarStyle:   'hiddenInset',
    icon:            path.join(ROOT, 'assets/icon.png'),
    webPreferences: {
      preload:            path.join(__dirname, 'preload.js'),
      contextIsolation:   true,     // REQUIRED for security
      nodeIntegration:    false,    // REQUIRED for security
      sandbox:            true,     // recommended
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(ROOT, 'dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (!isDev) checkForUpdates();
  });

  mainWindow.on('close', (e) => {
    // Minimize to tray instead of closing
    e.preventDefault();
    mainWindow?.hide();
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  setupIpcHandlers();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
  else mainWindow.show();
});
```

---

## Preload script — safe IPC bridge

```typescript
// agent-desktop/src/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

// Expose ONLY specific channels to the renderer — never expose ipcRenderer directly
contextBridge.exposeInMainWorld('electronAPI', {
  // App version
  getVersion: () => ipcRenderer.invoke('app:get-version'),

  // File operations
  openFilePicker: (options: Electron.OpenDialogOptions) =>
    ipcRenderer.invoke('dialog:open-file', options),
  saveFile: (options: Electron.SaveDialogOptions) =>
    ipcRenderer.invoke('dialog:save-file', options),
  writeFile: (filePath: string, data: string) =>
    ipcRenderer.invoke('fs:write-file', filePath, data),

  // Update
  onUpdateAvailable:   (cb: () => void) => ipcRenderer.on('update:available', cb),
  onUpdateDownloaded:  (cb: () => void) => ipcRenderer.on('update:downloaded', cb),
  installUpdate:       ()               => ipcRenderer.invoke('update:install'),

  // Open external links in OS browser (never inside Electron)
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),

  // Notifications
  showNotification: (title: string, body: string) =>
    ipcRenderer.invoke('notification:show', title, body),
});

// TypeScript types for renderer:
// declare global { interface Window { electronAPI: typeof api } }
```

---

## IPC handlers (main process)

```typescript
// agent-desktop/src/ipcHandlers.ts
import { ipcMain, dialog, shell, Notification, app } from 'electron';
import fs from 'fs/promises';
import path from 'path';

export function setupIpcHandlers() {
  ipcMain.handle('app:get-version', () => app.getVersion());

  ipcMain.handle('dialog:open-file', async (_, options: Electron.OpenDialogOptions) => {
    const result = await dialog.showOpenDialog(options);
    return result;   // { canceled, filePaths }
  });

  ipcMain.handle('dialog:save-file', async (_, options: Electron.SaveDialogOptions) => {
    return dialog.showSaveDialog(options);
  });

  ipcMain.handle('fs:write-file', async (_, filePath: string, data: string) => {
    // Security: only allow writes to user's Downloads/Documents
    const allowed = [app.getPath('downloads'), app.getPath('documents')];
    const resolved = path.resolve(filePath);
    if (!allowed.some(dir => resolved.startsWith(dir))) {
      throw new Error('Write outside allowed directories rejected');
    }
    await fs.writeFile(resolved, data, 'utf8');
    return { success: true, path: resolved };
  });

  ipcMain.handle('shell:open-external', async (_, url: string) => {
    // Validate URL before opening
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return;
    await shell.openExternal(url);
  });

  ipcMain.handle('notification:show', (_, title: string, body: string) => {
    new Notification({ title, body }).show();
  });

  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall();
  });
}
```

---

## Tray icon

```typescript
// agent-desktop/src/tray.ts
import { Tray, Menu, nativeImage, app } from 'electron';

export function createTray() {
  const icon = nativeImage.createFromPath(path.join(ROOT, 'assets/tray-icon.png'));
  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open',        click: () => mainWindow?.show() },
    { type:  'separator' },
    { label: 'Check for updates', click: () => autoUpdater.checkForUpdates() },
    { type:  'separator' },
    { label: 'Quit',        click: () => { app.quit(); } },
  ]);

  tray.setToolTip('Boilerplate App');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow?.isVisible() ? mainWindow.hide() : mainWindow?.show());
}
```

---

## Auto-update (electron-updater)

```typescript
// agent-desktop/src/updater.ts
import { autoUpdater } from 'electron-updater';
import { BrowserWindow } from 'electron';

autoUpdater.autoDownload          = true;
autoUpdater.autoInstallOnAppQuit  = true;

export function checkForUpdates() {
  autoUpdater.checkForUpdates();

  autoUpdater.on('update-available', () => {
    mainWindow?.webContents.send('update:available');
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update:downloaded');
  });

  autoUpdater.on('error', (err) => {
    console.error('[Updater]', err.message);
  });
}
```

```typescript
// frontend — update prompt component
function ElectronUpdateBanner() {
  const isElectron  = !!window.electronAPI;
  const [available,  setAvailable]  = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    if (!isElectron) return;
    window.electronAPI.onUpdateAvailable(()  => setAvailable(true));
    window.electronAPI.onUpdateDownloaded(() => setDownloaded(true));
  }, []);

  if (!isElectron || (!available && !downloaded)) return null;

  return (
    <div className="fixed bottom-4 right-4 floating-card rounded-[var(--card-radius)] p-4 max-w-xs z-[9999]">
      <p className="text-sm font-medium">
        {downloaded ? 'Update ready to install' : 'Downloading update…'}
      </p>
      {downloaded && (
        <button className="btn btn--primary btn--sm mt-3 w-full"
          onClick={() => window.electronAPI.installUpdate()}>
          Restart and install
        </button>
      )}
    </div>
  );
}
```

---

## electron-builder config (package.json)

```json
{
  "build": {
    "appId": "com.aniston.boilerplate",
    "productName": "Boilerplate App",
    "directories": { "output": "release" },
    "files": ["dist/**/*", "agent-desktop/dist/**/*", "assets/**/*"],
    "win": {
      "target": [{ "target": "nsis", "arch": ["x64"] }],
      "icon": "assets/icon.ico",
      "requestedExecutionLevel": "asInvoker"
    },
    "nsis": {
      "oneClick":               false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut":  true,
      "createStartMenuShortcut": true
    },
    "mac": {
      "target":   "dmg",
      "icon":     "assets/icon.icns",
      "category": "public.app-category.business"
    },
    "linux": {
      "target": "AppImage",
      "icon":   "assets/icon.png"
    },
    "publish": [{
      "provider": "github",
      "owner":    "your-org",
      "repo":     "your-repo"
    }]
  }
}
```

---

## Checklist

- [ ] `contextIsolation: true` and `nodeIntegration: false` in BrowserWindow webPreferences
- [ ] `sandbox: true` in webPreferences
- [ ] Preload script only exposes named channels — never exposes `ipcRenderer` directly
- [ ] File write IPC handler validates path is inside allowed directories (downloads, documents)
- [ ] `shell.openExternal` validates URL protocol (http/https only) before opening
- [ ] Tray "Quit" bypasses the `close` event prevention (`app.quit()`)
- [ ] Auto-update configured with GitHub Releases as publish target
- [ ] Update downloaded banner shows in renderer with "Restart and install" CTA
- [ ] EXE/DMG not committed to git — built in CI and attached to GitHub Release
- [ ] Code signing certificate stored in GitHub Secrets (Windows: `CSC_LINK`, `CSC_KEY_PASSWORD`)
