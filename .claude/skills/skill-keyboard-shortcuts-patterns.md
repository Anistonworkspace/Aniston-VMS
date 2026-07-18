# Skill: Keyboard Shortcuts & UI Hotkey Patterns

Design tokens: see `docs/04-uiux-brief.md`.

## Prerequisites — create `frontend/src/app/uiSlice.ts` first

The snippets below dispatch actions from `@/app/uiSlice` (open command palette, open keyboard-help overlay, open create-camera modal, toggle search bar, move focus within the Live Wall). That slice must exist before any hotkey below compiles.

```ts
// frontend/src/app/uiSlice.ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface UiState {
  commandPaletteOpen: boolean;
  keyboardHelpOpen: boolean;
  createModalOpen: { type: 'camera' | 'zone' | 'site' | null };
  searchBarOpen: boolean;
  liveViewFocusedTile: number; // index into the active LiveWallGrid
}

const initialState: UiState = {
  commandPaletteOpen: false,
  keyboardHelpOpen: false,
  createModalOpen: { type: null },
  searchBarOpen: false,
  liveViewFocusedTile: 0,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    openCommandPalette: (s) => { s.commandPaletteOpen = true; },
    closeCommandPalette: (s) => { s.commandPaletteOpen = false; },
    openKeyboardHelp: (s) => { s.keyboardHelpOpen = true; },
    closeKeyboardHelp: (s) => { s.keyboardHelpOpen = false; },
    openCreateModal: (s, a: PayloadAction<{ type: 'camera' | 'zone' | 'site' }>) => { s.createModalOpen = a.payload; },
    closeCreateModal: (s) => { s.createModalOpen = { type: null }; },
    toggleSearchBar: (s) => { s.searchBarOpen = !s.searchBarOpen; },
    setLiveViewFocusedTile: (s, a: PayloadAction<number>) => { s.liveViewFocusedTile = a.payload; },
  },
});
export const {
  openCommandPalette, closeCommandPalette, openKeyboardHelp, closeKeyboardHelp,
  openCreateModal, closeCreateModal, toggleSearchBar, setLiveViewFocusedTile,
} = uiSlice.actions;
export default uiSlice.reducer;
```

Prereq package:

```
pnpm add react-hotkeys-hook
```

---

## Global shortcuts hook

```ts
// frontend/src/hooks/useGlobalShortcuts.ts
import { useHotkeys } from 'react-hotkeys-hook';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { openCommandPalette, closeCommandPalette, openKeyboardHelp, openCreateModal, toggleSearchBar } from '@/app/uiSlice';

export function useGlobalShortcuts() {
  const dispatch = useAppDispatch();
  const commandPaletteOpen = useAppSelector((s) => s.ui.commandPaletteOpen);

  useHotkeys('meta+k, ctrl+k', (e) => { e.preventDefault(); dispatch(openCommandPalette()); }, { enableOnFormTags: true });
  useHotkeys('escape', () => { if (commandPaletteOpen) dispatch(closeCommandPalette()); }, { enableOnFormTags: true });
  useHotkeys('shift+/', () => dispatch(openKeyboardHelp()), { enableOnFormTags: false }); // "?"
  useHotkeys('meta+shift+c, ctrl+shift+c', (e) => { e.preventDefault(); dispatch(openCreateModal({ type: 'camera' })); });
  useHotkeys('/', (e) => { e.preventDefault(); dispatch(toggleSearchBar()); }, { enableOnFormTags: false });
}
```

Register once at the app shell (`<AppShell>`), never per-page — duplicate registrations fire the same action twice per keypress.

## Live View controls

The Live Wall tile grid (`LiveWallGrid` + single-camera `PlayerShell`) gets its own scoped hotkey set, active only while a wall or player has DOM focus, so typing `/` in an incident-note form elsewhere on the page never mutes a stream by accident.

| Key | Action |
|---|---|
| `Space` | Play / pause the focused tile |
| `M` | Mute / unmute the focused tile |
| `F` | Toggle fullscreen on the focused tile |
| `S` | Capture snapshot from the focused tile |
| `←` `→` `↑` `↓` | Move focus between tiles in the grid |
| `1`–`9` | Jump focus directly to tile N |
| `N` / `P` | Next / previous camera (single-camera `PlayerShell` view) |
| `Esc` | Exit fullscreen, then exit live view |

```ts
// frontend/src/features/live-wall/useLiveWallShortcuts.ts
import { useHotkeys } from 'react-hotkeys-hook';

export function useLiveWallShortcuts({ tileCount, gridCols, focusedTile, setFocusedTile, tiles }: {
  tileCount: number;
  gridCols: number;
  focusedTile: number;
  setFocusedTile: (i: number) => void;
  tiles: WallTile[];
}) {
  const focused = tiles[focusedTile];
  const clamp = (v: number) => Math.max(0, Math.min(tileCount - 1, v));

  useHotkeys('space', (e) => { e.preventDefault(); togglePlay(focused.cameraId); });
  useHotkeys('m', () => toggleMute(focused.cameraId));
  useHotkeys('f', () => toggleFullscreen(focused.cameraId));
  useHotkeys('s', () => captureSnapshot(focused.cameraId));
  useHotkeys('left', () => setFocusedTile(clamp(focusedTile - 1)));
  useHotkeys('right', () => setFocusedTile(clamp(focusedTile + 1)));
  useHotkeys('up', () => setFocusedTile(clamp(focusedTile - gridCols)));
  useHotkeys('down', () => setFocusedTile(clamp(focusedTile + gridCols)));
  for (let n = 1; n <= 9; n++) {
    useHotkeys(String(n), () => { if (n - 1 < tileCount) setFocusedTile(n - 1); });
  }
  useHotkeys('escape', () => exitFullscreenThenLiveView());
}
```

Mount this hook only while `<LiveWallGrid>` / `<PlayerShell>` is on screen (or gate it on a "live view has focus" ref) — these single-letter keys (`m`, `f`, `s`) must **not** fire while the operator is typing in an incident note or any form field elsewhere on the same page.

## Keyboard shortcuts help overlay (`?`)

```tsx
// frontend/src/components/KeyboardShortcutsHelp.tsx
import { useHotkeys } from 'react-hotkeys-hook';

const SHORTCUTS: { section: string; items: { keys: string[]; label: string }[] }[] = [
  { section: 'Navigation', items: [
    { keys: ['⌘', 'K'], label: 'Command palette' },
    { keys: ['/'], label: 'Focus search' },
  ]},
  { section: 'Live View', items: [
    { keys: ['Space'], label: 'Play / pause tile' },
    { keys: ['M'], label: 'Mute / unmute' },
    { keys: ['F'], label: 'Fullscreen' },
    { keys: ['S'], label: 'Snapshot' },
    { keys: ['1', '–', '9'], label: 'Jump to tile' },
  ]},
  { section: 'Incidents', items: [
    { keys: ['A'], label: 'Acknowledge selected incident' },
    { keys: ['⌘', 'Shift', 'C'], label: 'Add camera' },
  ]},
  { section: 'General', items: [
    { keys: ['Esc'], label: 'Close modal / exit live view' },
    { keys: ['?'], label: 'Show this help' },
  ]},
];

export function KeyboardShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  useHotkeys('escape', onClose, { enabled: open });
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--backdrop-color)]" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-[var(--card)] rounded-[var(--radius-big)] shadow-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-[var(--ink)] mb-4">Keyboard shortcuts</h2>
        <div className="space-y-5">
          {SHORTCUTS.map((s) => (
            <div key={s.section}>
              <h3 className="text-xs uppercase tracking-wide text-[var(--muted)] mb-2">{s.section}</h3>
              {s.items.map((item) => (
                <div key={item.label} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-[var(--ink)]">{item.label}</span>
                  <span className="flex gap-1">
                    {item.keys.map((k) => (
                      <kbd key={k} className="px-2 py-0.5 rounded border border-[var(--hairline)] bg-[var(--base-tint)] text-xs font-mono">{k}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

## List / table keyboard navigation — incident & camera lists

```ts
// frontend/src/hooks/useTableKeyboardNav.ts
import { useRef, useState } from 'react';

interface UseTableKeyboardOptions {
  rowCount: number;
  onSelect: (index: number) => void;
  onOpen: (index: number) => void;
  onDelete?: (index: number) => void;
}

export function useTableKeyboardNav({ rowCount, onSelect, onOpen, onDelete }: UseTableKeyboardOptions) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); const next = Math.min(selectedIndex + 1, rowCount - 1); setSelectedIndex(next); onSelect(next); }
    if (e.key === 'ArrowUp') { e.preventDefault(); const next = Math.max(selectedIndex - 1, 0); setSelectedIndex(next); onSelect(next); }
    if (e.key === 'Enter') onOpen(selectedIndex);
    if ((e.key === 'Delete' || e.key === 'Backspace') && onDelete && !e.metaKey && !e.ctrlKey) onDelete(selectedIndex);
  }

  return { selectedIndex, containerRef, handleKeyDown };
}
```

```tsx
// row rendering — selected vs. hover use the two dedicated tokens, never ad-hoc grays
<div
  className={idx === selectedIndex ? 'bg-[var(--primary-selected-color)]' : 'hover:bg-[var(--primary-hover-color)]'}
  onClick={() => onSelect(idx)}
>
  {incident.code} · {incident.cameraName}
</div>
```

Used identically on the incident list (arrow keys move the highlighted row, `Enter` opens the incident detail, `Delete` opens the "remove"/"escalate" confirm — never destructive on its own) and the camera inventory table.

## Focus trap for modals

```ts
// frontend/src/hooks/useFocusTrap.ts
import { useEffect } from 'react';
import type { RefObject } from 'react';

export function useFocusTrap(containerRef: RefObject<HTMLElement>, active: boolean) {
  useEffect(() => {
    if (!active || !containerRef.current) return;
    const container = containerRef.current;
    const focusable = container.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();

    function handleTab(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
    container.addEventListener('keydown', handleTab);
    return () => container.removeEventListener('keydown', handleTab);
  }, [active, containerRef]);
}
```

Every modal (add camera, edit zone, confirm escalate, keyboard help) must trap focus — Tab cycles inside, focus never escapes to the page behind the backdrop.

## Electron shell — native menu + accelerators

Aniston VMS ships a desktop shell (control-room kiosk mode) via Electron. Native accelerators must dispatch the **same** Redux actions as the web hotkeys, routed through IPC, so behavior is identical in-browser and in the desktop app.

```ts
// electron/main/menu.ts
import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';

export function buildMenu(mainWindow: BrowserWindow) {
  const send = (channel: string) => () => mainWindow.webContents.send(channel);

  const template: MenuItemConstructorOptions[] = [
    { label: 'Aniston VMS', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'View', submenu: [
      { label: 'Live Wall', accelerator: 'CmdOrCtrl+1', click: send('navigate:live-wall') },
      { label: 'Incidents', accelerator: 'CmdOrCtrl+2', click: send('navigate:incidents') },
      { label: 'Command Palette', accelerator: 'CmdOrCtrl+K', click: send('open:command-palette') },
      { type: 'separator' },
      { label: 'Toggle Fullscreen', accelerator: 'F', click: send('live:toggle-fullscreen') },
      { role: 'reload' },
      { role: 'toggleDevTools' },
    ]},
    { label: 'Camera', submenu: [
      { label: 'Add Camera…', accelerator: 'CmdOrCtrl+Shift+C', click: send('open:add-camera') },
    ]},
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
```

```ts
// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  onNavigate: (cb: (route: string) => void) => ipcRenderer.on('navigate:live-wall', () => cb('live-wall')),
  onOpenCommandPalette: (cb: () => void) => ipcRenderer.on('open:command-palette', cb),
  onOpenAddCamera: (cb: () => void) => ipcRenderer.on('open:add-camera', cb),
});
```

```ts
// frontend/src/hooks/useElectronShortcuts.ts — bridges native accelerators into the same Redux actions
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '@/app/hooks';
import { openCommandPalette, openCreateModal } from '@/app/uiSlice';

export function useElectronShortcuts() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

  useEffect(() => {
    if (!isElectron) return;
    window.electronAPI.onOpenCommandPalette(() => dispatch(openCommandPalette()));
    window.electronAPI.onOpenAddCamera(() => dispatch(openCreateModal({ type: 'camera' })));
    window.electronAPI.onNavigate((route) => navigate(`/${route}`));
  }, [isElectron, dispatch, navigate]);
}
```

Don't double-register: when `isElectron`, the browser-only `meta+k` binding still works fine as a fallback, but the native accelerator is the primary path — one action, one source of truth per platform, never divergent behavior between them.

## Checklist

- [ ] Every global hotkey registered exactly once, at the app shell — never re-registered per page/component
- [ ] Single-letter live-view keys (`m`, `f`, `s`, `1`–`9`) scoped to when a `LiveWallGrid`/`PlayerShell` actually has focus — never fire while typing in a form (`enableOnFormTags: false` unless explicitly needed)
- [ ] `Escape` closes exactly one thing at a time (fullscreen → live view → modal → command palette), in that priority order — never closes two layers on one keypress
- [ ] Focus indicator MUST be visible (never `outline: none` without a replacement) for all interactive elements reachable via Tab
- [ ] `useFocusTrap` present on every modal — Tab/Shift+Tab cycle within, never escape to the page behind the backdrop
- [ ] `?` opens the keyboard-shortcuts help overlay from anywhere except an open text input
- [ ] Electron accelerators and web hotkeys dispatch the identical Redux action — no divergent behavior between desktop shell and browser
- [ ] List/table keyboard nav: arrow keys move selection, `Enter` opens, `Delete`/`Backspace` opens a confirm dialog — never deletes/escalates directly
- [ ] All standard OS/browser shortcuts (`Cmd+R`, `Cmd+W`, `Cmd+Tab`) left untouched — the app only claims shortcuts it explicitly owns
- [ ] All interactive UI reachable by Tab alone (WCAG 2.1) — true regardless of whether any custom shortcut is enabled