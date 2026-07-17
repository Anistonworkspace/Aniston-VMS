import { app, BrowserWindow, Menu } from 'electron';
import type { Tray } from 'electron';
import path from 'path';
import { setupIpcHandlers } from './ipcHandlers.js';
import { checkForUpdates } from './updater.js';
import { createTray } from './tray.js';

const isDev = process.env.NODE_ENV === 'development';

// Resolve the frontend dist that electron-builder copies to resources/app/
const RENDERER_DIST = isDev
  ? null
  : path.join(process.resourcesPath, 'app');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

export function getMainWindow() { return mainWindow; }
export function getTray()       { return tray; }
export function setTray(t: Tray | null) { tray = t; }

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,  // REQUIRED — never disable
      nodeIntegration: false,  // REQUIRED — never enable
      sandbox: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST!, 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (!isDev) checkForUpdates();
  });

  // Minimize to tray on close instead of quitting
  mainWindow.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Remove default menu bar in production
if (!isDev) {
  Menu.setApplicationMenu(null);
}

app.whenReady().then(() => {
  createWindow();
  tray = createTray(mainWindow);
  setupIpcHandlers();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
  else mainWindow.show();
});

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}
