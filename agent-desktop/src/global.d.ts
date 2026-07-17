// Declares app.isQuiting on Electron's App so main.ts/tray.ts can distinguish a
// real quit (tray "Quit" action) from a window close that minimizes to tray.
declare global {
  namespace Electron {
    interface App {
      isQuiting?: boolean;
    }
  }
}

export {};
