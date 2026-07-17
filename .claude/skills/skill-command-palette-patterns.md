# Skill — Command Palette (Cmd+K) Patterns

The Cmd+K palette is the modern app's control center — quick navigation, quick
actions, quick search. Pairs with `skill-keyboard-shortcuts-patterns.md`
(which handles the hotkey registration) and reuses the existing modal
primitive.

Prereqs: `react-hotkeys-hook` (see keyboard-shortcuts skill), `cmdk`
package (`npm install cmdk`), Framer Motion.

---

## Slice — `uiSlice` prerequisites

The `openCommandPalette` action must exist. See
`skill-keyboard-shortcuts-patterns.md` § Prerequisites for the 30-line uiSlice
stub — same slice used here.

---

## Pattern 1 — Basic palette

```typescript
// frontend/src/features/command-palette/CommandPalette.tsx
import { Command } from 'cmdk';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useSelector, useDispatch } from 'react-redux';
import { closeCommandPalette } from '@/app/uiSlice';
import type { RootState } from '@/app/store';
import { useEffect } from 'react';

export function CommandPalette() {
  const open = useSelector((s: RootState) => s.ui.commandPaletteOpen);
  const dispatch = useDispatch();
  const reduce = useReducedMotion();
  const close = () => dispatch(closeCommandPalette());

  // Close on route change (uncomment if using react-router)
  // useLocation().pathname // subscribe; call close() on change

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={close}
            className="fixed inset-0 z-40 bg-[var(--backdrop-color)]"
          />
          <motion.div
            initial={reduce ? undefined : { opacity: 0, y: -8, scale: 0.98 }}
            animate={reduce ? undefined : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-1/2 top-24 z-50 w-full max-w-lg -translate-x-1/2 px-4"
          >
            <Command
              label="Command menu"
              className="floating-card overflow-hidden rounded-[var(--radius-big)] shadow-lg"
            >
              <Command.Input
                placeholder="Search actions, pages, help…"
                className="w-full border-b border-[var(--layout-border-color)] bg-transparent px-4 py-3 text-sm outline-none placeholder:text-[var(--tertiary-text-color)]"
                autoFocus
              />
              <Command.List className="max-h-80 overflow-y-auto p-2">
                <Command.Empty className="px-3 py-6 text-center text-sm text-[var(--secondary-text-color)]">
                  No results.
                </Command.Empty>
                {/* Groups below */}
              </Command.List>
            </Command>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

---

## Pattern 2 — Grouped items with recent-first ordering

Users are creatures of habit. Show recently-used actions at the top.

```typescript
import { useSelector } from 'react-redux';

const RECENT_LS_KEY = 'cmdk_recent_v1';

function pushRecent(key: string) {
  try {
    const raw = localStorage.getItem(RECENT_LS_KEY);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    const next = [key, ...list.filter((k) => k !== key)].slice(0, 8);
    localStorage.setItem(RECENT_LS_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

function getRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_LS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

// Inside <Command.List>:
<Command.Group heading="Recent" className="text-xs uppercase tracking-wide text-[var(--tertiary-text-color)]">
  {getRecent().slice(0, 4).map((key) => {
    const action = ALL_ACTIONS.find((a) => a.key === key);
    if (!action) return null;
    return (
      <Command.Item
        key={key}
        onSelect={() => { pushRecent(key); action.run(); }}
        className="flex items-center gap-3 rounded-[var(--radius-small)] px-3 py-2 text-sm data-[selected=true]:bg-[var(--ui-background-color)]"
      >
        <action.icon size={14} strokeWidth={1.8} />
        {action.label}
      </Command.Item>
    );
  })}
</Command.Group>

<Command.Group heading="Navigation" /* ... */>
  {NAV_ITEMS.map((it) => <Command.Item key={it.key} onSelect={() => { pushRecent(it.key); navigate(it.path); }}>{it.label}</Command.Item>)}
</Command.Group>

<Command.Group heading="Actions" /* ... */>
  {ACTIONS.map((a) => <Command.Item key={a.key} onSelect={() => { pushRecent(a.key); a.run(); }}>{a.label}</Command.Item>)}
</Command.Group>
```

---

## Pattern 3 — Async loading (RTK Query / MCP)

Pull results from an API as the user types. Debounce the input, show a
skeleton while loading.

```typescript
import { useState } from 'react';
import { useDebounce } from '@/hooks/useDebounce';           // 300ms debounce
import { useSearchEntitiesQuery } from '@/features/search/searchApi';

function AsyncResults({ query }: { query: string }) {
  const debounced = useDebounce(query, 300);
  const { data, isFetching } = useSearchEntitiesQuery(debounced, { skip: debounced.length < 2 });
  if (isFetching) {
    return (
      <Command.Loading className="px-3 py-4">
        <div className="skeleton h-4 w-3/4 rounded-[var(--radius-small)]" />
      </Command.Loading>
    );
  }
  return (
    <Command.Group heading="Search results">
      {(data ?? []).map((r) => (
        <Command.Item key={r.id} onSelect={() => navigate(r.href)}>
          {r.title}
        </Command.Item>
      ))}
    </Command.Group>
  );
}
```

Wire input state:

```typescript
const [q, setQ] = useState('');
<Command.Input value={q} onValueChange={setQ} placeholder="…" />
{q.length >= 2 && <AsyncResults query={q} />}
```

---

## Pattern 4 — Keyboard hints on each item

Users trust palettes more when items show their hotkeys.

```typescript
<Command.Item onSelect={runNewNote}>
  <div className="flex flex-1 items-center gap-3">
    <PlusIcon size={14} strokeWidth={1.8} />
    New note
  </div>
  <kbd className="rounded-[var(--radius-small)] bg-[var(--ui-background-color)] px-1.5 py-0.5 text-xs font-mono text-[var(--secondary-text-color)]">
    ⌘ N
  </kbd>
</Command.Item>
```

---

## Pattern 5 — Sub-menus (multi-step actions)

When an action needs a target ("Assign to…"), open a second palette page.

```typescript
const [page, setPage] = useState<'root' | 'assignTo'>('root');

<Command.List>
  {page === 'root' && (
    <Command.Item onSelect={() => setPage('assignTo')}>
      Assign to teammate…
    </Command.Item>
  )}
  {page === 'assignTo' && (
    <>
      <Command.Item onSelect={() => setPage('root')}>← Back</Command.Item>
      {teammates.map((t) => (
        <Command.Item key={t.id} onSelect={() => assign(t.id)}>{t.name}</Command.Item>
      ))}
    </>
  )}
</Command.List>
```

**Rule:** always provide a "Back" option and reset `page` to `root` when the
palette closes.

---

## Pattern 6 — Command registry (single source of truth)

```typescript
// frontend/src/features/command-palette/commands.ts
import type { LucideIcon } from 'lucide-react';
import { PlusIcon, SettingsIcon, LogOutIcon, HomeIcon } from 'lucide-react';

export type Command = {
  key: string;                     // stable id — used by Recent
  label: string;
  icon: LucideIcon;
  keywords?: string[];             // extra tokens for fuzzy match
  hotkey?: string;                 // "meta+n" — display + trigger
  group: 'Navigation' | 'Actions' | 'Account';
  requires?: (state: RootState) => boolean;   // RBAC — hide if false
  run: (ctx: CommandContext) => void;
};

export type CommandContext = {
  navigate: (path: string) => void;
  dispatch: AppDispatch;
  toast: ToastApi;
};

export const COMMANDS: Command[] = [
  {
    key: 'goto.home',
    label: 'Go to Dashboard',
    icon: HomeIcon,
    hotkey: 'g d',
    group: 'Navigation',
    run: ({ navigate }) => navigate('/dashboard'),
  },
  {
    key: 'create.item',
    label: 'New item',
    icon: PlusIcon,
    hotkey: 'meta+n',
    group: 'Actions',
    run: ({ dispatch }) => dispatch(openCreateModal()),
  },
  // ... one entry per command
];
```

Filter by RBAC:

```typescript
const availableCommands = COMMANDS.filter(
  (c) => !c.requires || c.requires(state)
);
```

---

## Do-not

- **No commands the user can't invoke.** If a role can't do X, hide X — don't
  show a disabled row. Palette users expect every row to work.
- **No autofocus on mobile.** Focus inside a modal on mobile triggers the
  keyboard and covers 50% of the screen. Use a search icon that opens the
  input instead.
- **No opening the palette from inside a form input.** Cmd+K inside a text
  field should still work — that's why you set `enableOnFormTags: false` in
  the hotkey; the palette must be reachable from anywhere.
- **No persistent search state across close/open.** Clear on close — most
  users start fresh.

---

## Checklist

- [ ] `uiSlice.commandPaletteOpen` toggles from Cmd+K (hotkey registered in
      `useGlobalShortcuts`)
- [ ] Escape closes the palette
- [ ] Backdrop click closes the palette
- [ ] Route change closes the palette (subscribe to `useLocation` in the
      component or handle in the router)
- [ ] Recent items persist in `localStorage` (max 8 keys)
- [ ] Every command hidden via `requires` when the user lacks permission
- [ ] Hotkeys shown as `<kbd>` on each row
- [ ] Async result groups have a Command.Loading skeleton
- [ ] Fully keyboard-navigable — arrow up/down, enter to select
- [ ] Focus trap — Tab stays inside the palette
- [ ] `AnimatePresence` wraps the palette so exit anim runs
- [ ] Dark-mode parity
- [ ] Search input is `type="search"` with `autoComplete="off"` and
      `spellCheck={false}`
