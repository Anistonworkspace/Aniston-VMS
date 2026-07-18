# Skill — Command Palette (Cmd+K) Patterns

The Cmd+K palette is the control center for jumping straight to a camera (`CAM-042`), a zone, a site, or an open incident — quick navigation, quick actions, quick search. Pairs with `skill-keyboard-shortcuts-patterns.md` (which handles the hotkey registration) and reuses the existing modal primitive.

Design tokens: see `docs/04-uiux-brief.md`. Prereqs: `react-hotkeys-hook` (see keyboard-shortcuts skill), `cmdk`.

---

## Command registry

```ts
// frontend/src/features/command-palette/commands.ts
import type { LucideIcon } from 'lucide-react';
import { HomeIcon, VideoIcon, MapPinIcon, AlertTriangleIcon, FileTextIcon, SettingsIcon, LogOutIcon, PlusIcon } from 'lucide-react';

export interface Command {
  id: string;
  label: string;
  group: 'Navigation' | 'Actions' | 'Account';
  icon: LucideIcon;
  keywords?: string[];
  run: (ctx: CommandContext) => void;
}

export const NAV_ITEMS: Command[] = [
  { id: 'nav-dashboard', label: 'Dashboard', group: 'Navigation', icon: HomeIcon, run: (ctx) => ctx.navigate('/dashboard') },
  { id: 'nav-live-wall', label: 'Live Wall', group: 'Navigation', icon: VideoIcon, run: (ctx) => ctx.navigate('/live') },
  { id: 'nav-zones', label: 'Zones', group: 'Navigation', icon: MapPinIcon, run: (ctx) => ctx.navigate('/zones') },
  { id: 'nav-incidents', label: 'Incidents', group: 'Navigation', icon: AlertTriangleIcon, run: (ctx) => ctx.navigate('/incidents') },
  { id: 'nav-reports', label: 'Reports', group: 'Navigation', icon: FileTextIcon, run: (ctx) => ctx.navigate('/reports') },
];

export const ACTIONS: Command[] = [
  { id: 'action-add-camera', label: 'Add camera', group: 'Actions', icon: PlusIcon, keywords: ['new', 'register', 'rtsp'], run: (ctx) => ctx.dispatch(openCreateModal({ type: 'camera' })) },
  { id: 'action-add-incident-note', label: 'Add note to open incident', group: 'Actions', icon: FileTextIcon, run: (ctx) => ctx.runAddIncidentNote() },
  { id: 'action-settings', label: 'Settings', group: 'Account', icon: SettingsIcon, run: (ctx) => ctx.navigate('/settings') },
  { id: 'action-logout', label: 'Log out', group: 'Account', icon: LogOutIcon, run: (ctx) => ctx.dispatch(logout()) },
];

export const ALL_ACTIONS = [...NAV_ITEMS, ...ACTIONS];
```

## Palette component

```tsx
// frontend/src/features/command-palette/CommandPalette.tsx
import { Command } from 'cmdk';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useSearchEntitiesQuery } from '@/features/search/searchApi';
import { useDebounce } from '@/hooks/useDebounce';
import { closeCommandPalette } from '@/app/uiSlice';
import type { RootState, AppDispatch } from '@/app/store';
import { NAV_ITEMS, ACTIONS, ALL_ACTIONS, type Command as CommandDef } from './commands';

const RECENT_LS_KEY = 'vms.commandPalette.recent';

function getRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_LS_KEY) ?? '[]'); } catch { return []; }
}
function pushRecent(id: string) {
  const next = [id, ...getRecent().filter((r) => r !== id)].slice(0, 5);
  localStorage.setItem(RECENT_LS_KEY, JSON.stringify(next));
}

export function CommandPalette() {
  const open = useSelector((s: RootState) => s.ui.commandPaletteOpen);
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 200);

  // Entity search: camera code/name, zone, site, or incident id (ANI-CAM-2026-000145)
  const { data: results, isFetching } = useSearchEntitiesQuery(debounced, { skip: debounced.length < 2 });

  useEffect(() => { if (!open) setQuery(''); }, [open]);

  function runCommand(cmd: CommandDef) {
    pushRecent(cmd.id);
    cmd.run({ navigate, dispatch, location, runAddIncidentNote: () => navigate('/incidents?openNote=1') });
    dispatch(closeCommandPalette());
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-[var(--backdrop-color)]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
          onClick={() => dispatch(closeCommandPalette())}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.16 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[var(--card)] rounded-[var(--radius-big)] shadow-xl border border-[var(--hairline)] overflow-hidden"
          >
            <Command shouldFilter={!debounced} loop>
              <div className="flex items-center border-b border-[var(--hairline)] px-4">
                <Command.Input
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Jump to a camera (CAM-042), zone, or incident…"
                  className="w-full py-3 bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
                />
              </div>
              <Command.List className="max-h-96 overflow-y-auto p-2">
                <Command.Empty className="py-8 text-center text-sm text-[var(--muted)]">
                  {isFetching ? 'Searching…' : 'No matches'}
                </Command.Empty>

                {!debounced && getRecent().length > 0 && (
                  <Command.Group heading="Recent">
                    {getRecent().map((id) => {
                      const cmd = ALL_ACTIONS.find((c) => c.id === id);
                      if (!cmd) return null;
                      return <CmdItem key={id} cmd={cmd} onSelect={() => runCommand(cmd)} />;
                    })}
                  </Command.Group>
                )}

                {debounced && results && (
                  <Command.Group heading="Cameras & Zones">
                    {results.map((r) => (
                      <Command.Item
                        key={r.id}
                        value={`${r.code} ${r.name}`}
                        onSelect={() => { pushRecent(r.id); navigate(r.type === 'camera' ? `/cameras/${r.id}` : `/zones/${r.id}`); dispatch(closeCommandPalette()); }}
                      >
                        <span className="font-mono text-xs text-[var(--muted)] mr-2">{r.code}</span>
                        {r.name}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                <Command.Group heading="Navigation">
                  {NAV_ITEMS.map((cmd) => <CmdItem key={cmd.id} cmd={cmd} onSelect={() => runCommand(cmd)} />)}
                </Command.Group>
                <Command.Group heading="Actions">
                  {ACTIONS.map((cmd) => <CmdItem key={cmd.id} cmd={cmd} onSelect={() => runCommand(cmd)} />)}
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CmdItem({ cmd, onSelect }: { cmd: CommandDef; onSelect: () => void }) {
  const Icon = cmd.icon;
  return (
    <Command.Item value={cmd.label} keywords={cmd.keywords} onSelect={onSelect} className="flex items-center gap-2 px-2 py-2 rounded-[var(--radius-small)] text-sm data-[selected=true]:bg-[var(--primary-selected-color)]">
      <Icon size={16} className="text-[var(--muted)]" />
      {cmd.label}
    </Command.Item>
  );
}
```

## Wiring the hotkey

Registration lives in the keyboard-shortcuts skill's `useGlobalShortcuts()` — `Cmd+K` / `Ctrl+K` dispatches `openCommandPalette()`, `Escape` dispatches `closeCommandPalette()`. Don't duplicate the listener here; the palette component only reads `commandPaletteOpen` from the store.

## Checklist

- [ ] Opening the palette never navigates until an item is selected (Enter or click) — typing alone must not trigger a side effect
- [ ] Recent list capped at 5, deduped, persisted to `localStorage` under a namespaced key (`vms.commandPalette.recent`) — no cross-tenant leakage since it's client-only
- [ ] Search input debounced 150–200ms before hitting `useSearchEntitiesQuery`
- [ ] Empty state distinguishes "type to search" (query too short) vs. "searching…" vs. "no matches"
- [ ] `Command.Empty` renders only once a real query has resolved with zero results
- [ ] Backdrop click and `Escape` both close the palette; focus returns to whatever triggered it
- [ ] Palette is a singleton mounted once at the app shell, not re-mounted per page
- [ ] Icons from `lucide-react`, 16px, `var(--muted)` unless selected (`var(--primary-selected-color)` background on the active row)
- [ ] Every entry keyboard-reachable — arrow keys + Enter, never a mouse-only action
- [ ] Palette results respect the signed-in role's scope (`organizationId`/zone) — a `CLIENT_VIEWER` never sees cameras outside their assigned zones in search results