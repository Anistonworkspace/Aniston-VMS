import { ipcMain, dialog, shell, Notification, app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { autoUpdater } from 'electron-updater';

export function setupIpcHandlers(): void {
  ipcMain.handle('app:get-version', () => app.getVersion());

  ipcMain.handle('dialog:open-file', async (_event, options: Electron.OpenDialogOptions) => {
    return dialog.showOpenDialog(options);
  });

  ipcMain.handle('dialog:save-file', async (_event, options: Electron.SaveDialogOptions) => {
    return dialog.showSaveDialog(options);
  });

  ipcMain.handle('fs:write-file', async (_event, filePath: string, data: string) => {
    // Security: only allow writes to user's Downloads or Documents
    const allowed = [app.getPath('downloads'), app.getPath('documents')];
    const resolved = path.resolve(filePath);
    if (!allowed.some((dir) => resolved.startsWith(dir))) {
      throw new Error('Write path is outside allowed directories (downloads, documents)');
    }
    await fs.writeFile(resolved, data, 'utf8');
    return { success: true, path: resolved };
  });

  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    // Only allow http/https URLs to prevent protocol-handler attacks
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Blocked external URL with protocol: ${parsed.protocol}`);
    }
    await shell.openExternal(url);
  });

  ipcMain.handle('notification:show', (_event, title: string, body: string) => {
    new Notification({ title, body }).show();
  });

  ipcMain.handle('update:install', () => {
    (app as any).isQuiting = true;
    autoUpdater.quitAndInstall();
  });
}
