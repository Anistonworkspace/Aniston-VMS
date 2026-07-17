import { autoUpdater } from 'electron-updater';
import { getMainWindow } from './main.js';

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

export function checkForUpdates(): void {
  autoUpdater.checkForUpdates().catch(() => {
    // Silently ignore update check failures (no network, etc.)
  });

  autoUpdater.on('update-available', () => {
    getMainWindow()?.webContents.send('update:available');
  });

  autoUpdater.on('update-downloaded', () => {
    getMainWindow()?.webContents.send('update:downloaded');
  });
}
