# Skill: Keyboard Shortcuts & UI Hotkey Patterns

## Prerequisites — create `frontend/src/app/uiSlice.ts` first

The snippets below dispatch actions from `@/app/uiSlice` (open command palette,
open keyboard-help overlay, open create modal, toggle search bar). That slice
doesn't ship with the boilerplate — create it before the hotkeys compile.

```typescript
// frontend/src/app/uiSlice.ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type UiState = {
  commandPaletteOpen: boolean;
  keyboardHelpOpen:   boolean;
  createModalOpen:    boolean;
  searchBarOpen:      boolean;
};

const initialState: UiState = {
  commandPaletteOpen: false,
  keyboardHelpOpen:   false,
  createModalOpen:    false,
  searchBarOpen:      false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    openCommandPalette:  (s) => { s.commandPaletteOpen = true; },
    closeCommandPalette: (s) => { s.commandPaletteOpen = false; },
    openKeyboardHelp:    (s) => { s.keyboardHelpOpen   = true; },
    closeKeyboardHelp:   (s) => { s.keyboardHelpOpen   = false; },
    openCreateModal:     (s) => { s.createModalOpen    = true; },
    closeCreateModal:    (s) => { s.createModalOpen    = false; },
    toggleSearchBar:     (s) => { s.searchBarOpen      = !s.searchBarOpen; },
  },
});

export const {
  openCommandPalette, closeCommandPalette,
  openKeyboardHelp,   closeKeyboardHelp,
  openCreateModal,    closeCreateModal,
  toggleSearchBar,
} = uiSlice.actions;
export const uiReducer = uiSlice.reducer;
```

Then register it in `frontend/src/app/store.ts`:

```typescript
import { uiReducer } from './uiSlice';
// inside configureStore({ reducer: { ... } }) — add:
//   ui: uiReducer,
```

`useAppDispatch` is exported alongside `useAppSelector` from
`frontend/src/hooks/useAuth.ts` (already in the boilerplate). With those two
pieces in place the snippets below compile as-is.

---

## Global hotkey hook (useHotkeys)

Install `react-hotkeys-hook` — the standard for React keyboard shortcuts.

```bash
npm install react-hotkeys-hook
```

```typescript
// frontend/src/hooks/useGlobalShortcuts.ts
import { useHotkeys } from 'react-hotkeys-hook';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '@/hooks/useAuth';
import { openCommandPalette } from '@/app/uiSlice';

export function useGlobalShortcuts() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  // Command palette (industry standard: Cmd+K or Ctrl+K)
  useHotkeys('meta+k, ctrl+k', (e) => {
    e.preventDefault();
    dispatch(openCommandPalette());
  }, { enableOnFormTags: false });

  // Navigation shortcuts
  useHotkeys('g d', () => navigate('/dashboard'),     { enableOnFormTags: false });
  useHotkeys('g i', () => navigate('/items'),         { enableOnFormTags: false });
  useHotkeys('g c', () => navigate('/categories'),    { enableOnFormTags: false });
  useHotkeys('g s', () => navigate('/settings'),      { enableOnFormTags: false });
  useHotkeys('g p', () => navigate('/profile'),       { enableOnFormTags: false });

  // Quick actions
  useHotkeys('meta+n, ctrl+n', (e) => { e.preventDefault(); dispatch(openCreateModal()); },  { enableOnFormTags: false });
  useHotkeys('meta+/, ctrl+/', (e) => { e.preventDefault(); dispatch(toggleSearchBar()); },   { enableOnFormTags: false });

  // Help overlay
  useHotkeys('shift+?', () => dispatch(openKeyboardShortcutsHelp()), { enableOnFormTags: false });
}

// Mount once at app root:
// function App() {
//   useGlobalShortcuts();
//   return <RouterProvider router={router} />;
// }
```

---

## Command palette (Cmd+K)

```typescript
// frontend/src/components/CommandPalette.tsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHotkeys } from 'react-hotkeys-hook';

interface Command {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Close on Escape
  useHotkeys('escape', onClose, { enabled: isOpen });

  const filtered = query
    ? commands.filter((cmd) =>
        cmd.label.toLowerCase().includes(query.toLowerCase()) ||
        cmd.keywords?.some((k) => k.toLowerCase().includes(query.toLowerCase()))
      )
    : commands;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      filtered[selectedIndex].action();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    // Portal so it renders above everything
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Palette */}
      <div className="relative w-full max-w-lg rounded-[8px] bg-white shadow-2xl overflow-hidden">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
          onKeyDown={handleKeyDown}
          placeholder="Type a command or search..."
          className="w-full px-4 py-3 text-sm font-figtree border-b border-gray-200 outline-none"
        />
        <ul className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 && (
            <li className="px-4 py-3 text-sm text-gray-500">No results for "{query}"</li>
          )}
          {filtered.map((cmd, i) => (
            <li
              key={cmd.id}
              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer text-sm ${
                i === selectedIndex ? 'bg-[#0073ea]/10 text-[#0073ea]' : 'text-gray-700 hover:bg-gray-50'
              }`}
              onClick={() => { cmd.action(); onClose(); }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              {cmd.icon && <span className="shrink-0 text-gray-400">{cmd.icon}</span>}
              <div>
                <div className="font-medium">{cmd.label}</div>
                {cmd.description && <div className="text-xs text-gray-400">{cmd.description}</div>}
              </div>
            </li>
          ))}
        </ul>
        <div className="px-4 py-2 border-t border-gray-100 flex gap-4 text-xs text-gray-400">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
          <span><kbd className="font-mono">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
```

---

## Modal keyboard behavior

All modals MUST close on Escape. Focus must be trapped inside the modal.

```typescript
// frontend/src/hooks/useModalKeyboard.ts
import { useEffect } from 'react';

export function useModalKeyboard(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
}

// Focus trap for modals (accessibility requirement)
export function useFocusTrap(containerRef: React.RefObject<HTMLElement>, isOpen: boolean) {
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const focusable = containerRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    first?.focus();

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [isOpen]);
}
```

---

## Table keyboard navigation

```typescript
// frontend/src/hooks/useTableKeyboard.ts
import { useHotkeys } from 'react-hotkeys-hook';

interface UseTableKeyboardOptions {
  rowCount: number;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onOpen?: (index: number) => void;   // Enter key
  onDelete?: (index: number) => void; // Delete key
}

export function useTableKeyboard({ rowCount, selectedIndex, onSelect, onOpen, onDelete }: UseTableKeyboardOptions) {
  useHotkeys('arrowdown', (e) => {
    e.preventDefault();
    const next = selectedIndex === null ? 0 : Math.min(selectedIndex + 1, rowCount - 1);
    onSelect(next);
  });

  useHotkeys('arrowup', (e) => {
    e.preventDefault();
    const prev = selectedIndex === null ? rowCount - 1 : Math.max(selectedIndex - 1, 0);
    onSelect(prev);
  });

  useHotkeys('enter', () => {
    if (selectedIndex !== null && onOpen) onOpen(selectedIndex);
  });

  useHotkeys('delete, backspace', () => {
    if (selectedIndex !== null && onDelete) onDelete(selectedIndex);
  });

  useHotkeys('home', (e) => { e.preventDefault(); onSelect(0); });
  useHotkeys('end',  (e) => { e.preventDefault(); onSelect(rowCount - 1); });
}
```

---

## Form shortcuts

```typescript
// Standard form keyboard behaviors (always wire these)
// 1. Ctrl+Enter to submit (for multi-line forms where Enter ≠ submit)
// 2. Escape to cancel/close
// 3. Tab order must match visual order (use tabIndex only to fix broken order)

function ItemForm({ onSubmit, onCancel }: Props) {
  const form = useForm<CreateItemInput>({ resolver: zodResolver(CreateItemSchema) });

  // Ctrl+Enter submits the form
  useHotkeys('ctrl+enter', () => form.handleSubmit(onSubmit)(), { enableOnFormTags: true });

  // Escape cancels
  useHotkeys('escape', onCancel, { enableOnFormTags: ['INPUT', 'SELECT'] });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {/* Tab order follows visual layout naturally — don't set tabIndex */}
      <Input {...form.register('name')} autoFocus /> {/* autoFocus on first field */}
      <Input {...form.register('email')} />
      <Button type="submit">Save <kbd className="ml-2 text-xs opacity-60">Ctrl+↵</kbd></Button>
      <Button type="button" variant="outline" onClick={onCancel}>Cancel <kbd className="ml-2 text-xs opacity-60">Esc</kbd></Button>
    </form>
  );
}
```

---

## Keyboard shortcuts help overlay

Show users what shortcuts exist (triggered by `?` key).

```typescript
// frontend/src/components/KeyboardShortcutsHelp.tsx
const SHORTCUTS = [
  { section: 'Navigation', shortcuts: [
    { keys: ['G', 'D'], label: 'Go to Dashboard' },
    { keys: ['G', 'I'], label: 'Go to Items' },
    { keys: ['G', 'C'], label: 'Go to Categories' },
  ]},
  { section: 'Actions', shortcuts: [
    { keys: ['Ctrl', 'K'], label: 'Open Command Palette' },
    { keys: ['Ctrl', 'N'], label: 'Create New' },
    { keys: ['Ctrl', '/'], label: 'Focus Search' },
  ]},
  { section: 'Tables', shortcuts: [
    { keys: ['↑', '↓'], label: 'Navigate rows' },
    { keys: ['↵'], label: 'Open selected row' },
    { keys: ['Del'], label: 'Delete selected' },
  ]},
  { section: 'General', shortcuts: [
    { keys: ['Esc'], label: 'Close modal / Cancel' },
    { keys: ['Ctrl', '↵'], label: 'Submit form' },
    { keys: ['?'], label: 'Show this help' },
  ]},
];

export function KeyboardShortcutsHelp({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  useHotkeys('escape', onClose, { enabled: isOpen });
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-[16px] shadow-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <h2 className="font-poppins font-semibold text-lg mb-4">Keyboard Shortcuts</h2>
        {SHORTCUTS.map((section) => (
          <div key={section.section} className="mb-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">{section.section}</h3>
            {section.shortcuts.map((s) => (
              <div key={s.label} className="flex items-center justify-between py-1.5">
                <span className="text-sm font-figtree text-gray-700">{s.label}</span>
                <div className="flex gap-1">
                  {s.keys.map((key) => (
                    <kbd key={key} className="px-2 py-0.5 bg-gray-100 border border-gray-300 rounded-[4px] text-xs font-mono text-gray-600">
                      {key}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Accessibility rules for keyboard users

```
WCAG 2.1 requirements (always follow these):
- All interactive elements reachable by Tab
- Focus indicator MUST be visible (never remove outline without a replacement)
- Custom hotkeys must not conflict with browser/OS shortcuts (avoid Ctrl+W, Ctrl+T, Ctrl+N in default scope)
- enableOnFormTags: false for navigation hotkeys (typing should not trigger nav)
- enableOnFormTags: true only for action hotkeys that make sense in forms (Ctrl+Enter to submit)
- Modal must trap focus (Tab cycles within modal, not outside)
- After modal closes, return focus to the element that opened it

Tailwind focus style (project standard — use on all interactive elements):
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0073ea] focus-visible:ring-offset-2
```

---

## Electron desktop shortcut integration

When the app runs as a Windows EXE (agent-desktop/), shortcuts work at two layers:
1. **Native menu accelerators** — defined in `main.ts` via `Menu.buildFromTemplate`, fire IPC events
2. **Web hotkeys** — `react-hotkeys-hook` in the renderer, same as the browser

The renderer must detect which environment it's in so shortcuts don't double-fire.

---

### Environment detection helper (use everywhere)

```typescript
// frontend/src/lib/platform.ts
export const isElectron = typeof window !== 'undefined' && !!window.electronAPI;
export const isMac     = navigator.platform.toLowerCase().includes('mac');

// Use CmdOrCtrl label correctly in UI hints
export const modKey = isMac ? '⌘' : 'Ctrl';
```

---

### Electron native menu with accelerators (agent-desktop/src/main.ts)

Define the native application menu with accelerators. When a user presses the shortcut, Electron fires an IPC event to the renderer — the renderer handles navigation/actions via Redux.

```typescript
// agent-desktop/src/menuTemplate.ts
import { Menu, app, BrowserWindow } from 'electron';

export function buildMenu(mainWindow: BrowserWindow): void {
  const send = (channel: string, payload?: unknown) =>
    mainWindow.webContents.send(channel, payload);

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { label: 'About', role: 'about' },
        { type: 'separator' },
        { label: 'Quit',  role: 'quit', accelerator: 'CmdOrCtrl+Q' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New…',
          accelerator: 'CmdOrCtrl+N',
          click: () => send('shortcut:action', 'create-new'),
        },
        {
          label: 'Export…',
          accelerator: 'CmdOrCtrl+E',
          click: () => send('shortcut:action', 'export'),
        },
      ],
    },
    {
      label: 'Go',
      submenu: [
        { label: 'Dashboard',  accelerator: 'CmdOrCtrl+1', click: () => send('shortcut:navigate', '/dashboard') },
        { label: 'Items',      accelerator: 'CmdOrCtrl+2', click: () => send('shortcut:navigate', '/items') },
        { label: 'Settings',   accelerator: 'CmdOrCtrl+,', click: () => send('shortcut:navigate', '/settings') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Command Palette', accelerator: 'CmdOrCtrl+K', click: () => send('shortcut:action', 'command-palette') },
        { label: 'Keyboard Shortcuts', accelerator: 'CmdOrCtrl+/', click: () => send('shortcut:action', 'show-shortcuts') },
        { type: 'separator' },
        { label: 'Reload',      role: 'reload',      accelerator: 'CmdOrCtrl+R' },
        { label: 'Force Reload', role: 'forceReload', accelerator: 'CmdOrCtrl+Shift+R' },
        { label: 'Dev Tools',   role: 'toggleDevTools', accelerator: 'F12' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
```

Call it from `main.ts`:
```typescript
// inside app.whenReady().then(...)
buildMenu(mainWindow);
```

---

### Preload — expose shortcut IPC channels

```typescript
// agent-desktop/src/preload.ts — add to existing contextBridge
contextBridge.exposeInMainWorld('electronAPI', {
  // ... existing methods ...

  // Menu shortcut events → renderer can listen to these
  onShortcutNavigate: (cb: (route: string) => void) =>
    ipcRenderer.on('shortcut:navigate', (_e, route) => cb(route)),
  onShortcutAction: (cb: (action: string) => void) =>
    ipcRenderer.on('shortcut:action', (_e, action) => cb(action)),

  // Cleanup (call in useEffect return)
  removeShortcutListeners: () => {
    ipcRenderer.removeAllListeners('shortcut:navigate');
    ipcRenderer.removeAllListeners('shortcut:action');
  },
});
```

---

### Renderer — useElectronShortcuts hook

```typescript
// frontend/src/hooks/useElectronShortcuts.ts
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '@/hooks/useAuth';
import { openCommandPalette, openKeyboardHelp, openCreateModal } from '@/app/uiSlice';
import { isElectron } from '@/lib/platform';

export function useElectronShortcuts() {
  const navigate   = useNavigate();
  const dispatch   = useAppDispatch();

  useEffect(() => {
    if (!isElectron || !window.electronAPI) return;

    // Navigation events from native menu
    window.electronAPI.onShortcutNavigate((route) => navigate(route));

    // Action events from native menu
    window.electronAPI.onShortcutAction((action) => {
      if (action === 'command-palette') dispatch(openCommandPalette());
      if (action === 'show-shortcuts')  dispatch(openKeyboardHelp());
      if (action === 'create-new')      dispatch(openCreateModal());
    });

    return () => window.electronAPI?.removeShortcutListeners();
  }, [navigate, dispatch]);
}
```

---

### useGlobalShortcuts — skip when Electron handles them natively

```typescript
// frontend/src/hooks/useGlobalShortcuts.ts
import { useHotkeys } from 'react-hotkeys-hook';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '@/hooks/useAuth';
import { openCommandPalette, openKeyboardHelp, openCreateModal, toggleSearchBar } from '@/app/uiSlice';
import { isElectron } from '@/lib/platform';

export function useGlobalShortcuts() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  // In Electron, Ctrl+K / Ctrl+N are already handled by the native menu.
  // Only register them as web hotkeys when NOT in Electron, to avoid double-fire.
  const skipNative = isElectron;

  useHotkeys('meta+k, ctrl+k', (e) => {
    e.preventDefault();
    dispatch(openCommandPalette());
  }, { enableOnFormTags: false, enabled: !skipNative });

  useHotkeys('meta+n, ctrl+n', (e) => {
    e.preventDefault();
    dispatch(openCreateModal());
  }, { enableOnFormTags: false, enabled: !skipNative });

  // G-chord navigation — safe in both web and Electron (not in native menu)
  useHotkeys('g d', () => navigate('/dashboard'),   { enableOnFormTags: false });
  useHotkeys('g i', () => navigate('/items'),       { enableOnFormTags: false });
  useHotkeys('g s', () => navigate('/settings'),    { enableOnFormTags: false });
  useHotkeys('g p', () => navigate('/profile'),     { enableOnFormTags: false });

  useHotkeys('meta+/, ctrl+/', (e) => { e.preventDefault(); dispatch(toggleSearchBar()); },
    { enableOnFormTags: false, enabled: !skipNative });

  useHotkeys('shift+?', () => dispatch(openKeyboardHelp()),
    { enableOnFormTags: false });
}
```

---

### Mount both hooks at app root

```typescript
// frontend/src/App.tsx
import { useGlobalShortcuts }   from '@/hooks/useGlobalShortcuts';
import { useElectronShortcuts } from '@/hooks/useElectronShortcuts';

export function AppShell() {
  useGlobalShortcuts();    // web browser shortcuts
  useElectronShortcuts();  // Electron native menu IPC events (no-op in browser)
  return <Outlet />;
}
```

---

### Global system shortcut (works even when app is minimized)

Use sparingly — system shortcuts conflict with other apps. Only register for critical "bring app to front" use cases.

```typescript
// agent-desktop/src/main.ts — inside app.whenReady().then(...)
import { globalShortcut } from 'electron';

// Ctrl+Shift+B — bring the app window to front from anywhere on the OS
app.whenReady().then(() => {
  globalShortcut.register('CmdOrCtrl+Shift+B', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
```

---

## Quick reference — all standard shortcuts in this boilerplate

| Shortcut | Action | Web | Electron EXE |
|----------|--------|-----|--------------|
| `Ctrl+K` / `Cmd+K` | Open command palette | `react-hotkeys-hook` | Native menu accelerator → IPC |
| `?` | Open keyboard shortcuts help | `react-hotkeys-hook` | `react-hotkeys-hook` (no native menu) |
| `Ctrl+N` | Create new | `react-hotkeys-hook` | Native menu accelerator → IPC |
| `Ctrl+/` | Focus search | `react-hotkeys-hook` | Native menu accelerator → IPC |
| `Ctrl+1/2/3` | Navigate sections | — | Native menu "Go" submenu → IPC |
| `Ctrl+,` | Open settings | — | Native menu accelerator → IPC |
| `Ctrl+Q` | Quit app | — | Native menu `role: 'quit'` |
| `Ctrl+Shift+B` | Bring app to front | — | `globalShortcut` (OS-level) |
| `G D` | Go to Dashboard | `react-hotkeys-hook` | `react-hotkeys-hook` |
| `G I` | Go to Items | `react-hotkeys-hook` | `react-hotkeys-hook` |
| `Esc` | Close modal / Cancel | `useModalKeyboard` | `useModalKeyboard` |
| `Ctrl+Enter` | Submit form | `react-hotkeys-hook` | `react-hotkeys-hook` |
| `↑ ↓` | Navigate table rows | `useTableKeyboard` | `useTableKeyboard` |
| `Enter` | Open selected row | `useTableKeyboard` | `useTableKeyboard` |
| `Delete` | Delete selected row | `useTableKeyboard` | `useTableKeyboard` |
| `Home` / `End` | First / last row | `useTableKeyboard` | `useTableKeyboard` |
| `F12` | Toggle DevTools | — | Native menu (dev only) |

---

## Checklist

- [ ] `isElectron` guard in `useGlobalShortcuts` — prevents double-fire for shortcuts handled by native menu
- [ ] All native menu accelerators send IPC events — never navigate directly (renderer owns routing)
- [ ] `onShortcutNavigate` / `onShortcutAction` listeners cleaned up in `useEffect` return
- [ ] `globalShortcut.unregisterAll()` called on `will-quit`
- [ ] No `Ctrl+W`, `Ctrl+T`, `Ctrl+R` as custom shortcuts — these have browser/OS meanings
- [ ] `enableOnFormTags: false` on all navigation hotkeys
- [ ] `enableOnFormTags: true` only on `Ctrl+Enter` (form submit)
- [ ] Focus returns to trigger element after modal closes
- [ ] All modals: `Escape` closes, Tab cycles within, focus trapped
