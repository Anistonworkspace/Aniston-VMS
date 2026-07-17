import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron';
import path from 'path';

export function createTray(mainWindow: BrowserWindow | null): Tray {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  const tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Boilerplate App');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        (app as any).isQuiting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow?.isVisible()) mainWindow.hide();
    else mainWindow?.show();
  });

  return tray;
}
