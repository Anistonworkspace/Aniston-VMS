# Skill — Modern Empty State Patterns

Empty states are the app's first impression on 40 % of screens. Every list,
search result, filter, and detail page gets one. Modern empty states are
minimal, action-oriented, and never blank.

Design system tokens: `skill-ui-ux-checklist.md`. All animations respect
`prefers-reduced-motion`.

---

## Rule 1 — Every empty state has a primary action

If there's nothing to show, tell the user how to make something. No dead
ends.

## Rule 2 — Never use the word "empty"

"You don't have any notes yet" → "Create your first note".
Focus on the action, not the absence.

## Rule 3 — Match the container

Full-page empty state uses full-page treatment. Modal empty state uses
modal-sized. Table-body empty state fits inside the table shell. Don't
transplant patterns between contexts.

---

## Pattern 1 — Full-page empty state (first-run)

```typescript
// frontend/src/components/EmptyState.tsx
import { motion, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

type EmptyStateProps = {
  icon?: LucideIcon;
  illustration?: React.ReactNode;   // optional SVG / Lottie
  title: string;
  body?: string;
  primary?: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
};

export function EmptyState({ icon: Icon, illustration, title, body, primary, secondary }: EmptyStateProps) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      initial={reduce ? undefined : { opacity: 0, y: 8 }}
      animate={reduce ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center"
    >
      {illustration ? (
        <div className="mb-6">{illustration}</div>
      ) : Icon ? (
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[var(--radius-big)] bg-[var(--ui-background-color)] text-[var(--secondary-text-color)]">
          <Icon size={24} strokeWidth={1.5} />
        </div>
      ) : null}
      <h3 className="font-heading text-lg">{title}</h3>
      {body && <p className="mt-2 text-sm text-[var(--secondary-text-color)]">{body}</p>}
      {(primary || secondary) && (
        <div className="mt-6 flex gap-2">
          {primary  && <button className="btn btn--primary btn--sm"   onClick={primary.onClick}>{primary.label}</button>}
          {secondary && <button className="btn btn--ghost btn--sm"    onClick={secondary.onClick}>{secondary.label}</button>}
        </div>
      )}
    </motion.section>
  );
}
```

Usage:

```typescript
{isSuccess && data.length === 0 && (
  <EmptyState
    icon={NotebookIcon}
    title="Create your first note"
    body="Notes let you capture ideas without leaving your workflow."
    primary={{ label: 'New note', onClick: openCreateModal }}
    secondary={{ label: 'Import from Notion', onClick: openImport }}
  />
)}
```

---

## Pattern 2 — Filter-empty state (results filtered out)

Different context — the user did something, and now nothing matches. Offer
a clear-filters escape.

```typescript
export function FilterEmpty({ onClear, activeFilterCount }: { onClear: () => void; activeFilterCount: number }) {
  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <p className="text-sm text-[var(--secondary-text-color)]">
        No results match {activeFilterCount === 1 ? 'this filter' : `these ${activeFilterCount} filters`}.
      </p>
      <button className="btn btn--ghost btn--sm mt-4" onClick={onClear}>
        Clear filters
      </button>
    </div>
  );
}
```

**Rule:** always show the count of active filters. Users often forget they've
stacked 3 filters.

---

## Pattern 3 — Search-empty state (query returned nothing)

Include the query so the user knows what was searched. Suggest alternatives.

```typescript
export function SearchEmpty({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="mx-auto max-w-md py-8 text-center">
      <p className="text-sm">
        No matches for{' '}
        <span className="rounded-[var(--radius-small)] bg-[var(--ui-background-color)] px-1.5 py-0.5 font-mono text-xs">
          {query}
        </span>
      </p>
      <p className="mt-3 text-xs text-[var(--tertiary-text-color)]">
        Try a shorter query or check spelling. Search matches title, body, and tags.
      </p>
      <button className="btn btn--ghost btn--sm mt-4" onClick={onClear}>
        Reset search
      </button>
    </div>
  );
}
```

---

## Pattern 4 — Table-body empty state

Fits inside the existing table shell — no full-page treatment. Row-height.

```typescript
{data.length === 0 && (
  <tr>
    <td colSpan={columns.length} className="py-16 text-center">
      <EmptyState
        icon={FileTextIcon}
        title="No records yet"
        body="Records appear here after your first import."
        primary={{ label: 'Import CSV', onClick: openImport }}
      />
    </td>
  </tr>
)}
```

---

## Pattern 5 — Skeleton-during-loading (not empty!)

Loading is NOT empty. Show skeletons matching the eventual shape.

```typescript
{isLoading && (
  <ul className="space-y-2">
    {Array.from({ length: 5 }).map((_, i) => (
      <li key={i} className="floating-card flex items-center gap-3 p-3">
        <div className="skeleton h-8 w-8 rounded-full" />
        <div className="flex-1 space-y-1">
          <div className="skeleton h-3 w-2/3 rounded-[var(--radius-small)]" />
          <div className="skeleton h-3 w-1/3 rounded-[var(--radius-small)]" />
        </div>
      </li>
    ))}
  </ul>
)}
```

`.skeleton` is the design-system primitive — do not roll your own. See
`skill-ui-ux-checklist.md` §14.

**Rule:** the skeleton shape MUST match the eventual content shape. Skeletons
that look nothing like the final layout cause a visible "jump" and hurt
perceived performance more than a plain spinner.

---

## Pattern 6 — Error-empty state

Distinct from empty — this is empty because something broke. Different
treatment (icon in negative color) and offer retry.

```typescript
export function ErrorEmpty({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={AlertCircleIcon}
      title="Could not load data"
      body="Something went wrong on our side. Try again — the second attempt often works."
      primary={{ label: 'Try again', onClick: onRetry }}
      secondary={{ label: 'Report issue', onClick: openSupport }}
    />
  );
}
```

Pair with `skill-error-handling-patterns.md`.

---

## Pattern 7 — First-run tips (progressive disclosure)

For a truly first-time user, show a small "how it works" tip strip below the
CTA. Dismissable, remembered in `localStorage`.

```typescript
export function FirstRunTips({ tips, storageKey }: { tips: string[]; storageKey: string }) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(storageKey) === '1');
  if (dismissed) return null;
  return (
    <aside className="mx-auto mt-6 max-w-md rounded-[var(--radius-medium)] border border-[var(--layout-border-color)] p-4 text-left text-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-[var(--tertiary-text-color)]">Tips</span>
        <button
          onClick={() => { localStorage.setItem(storageKey, '1'); setDismissed(true); }}
          className="text-xs text-[var(--secondary-text-color)] hover:underline"
        >
          Got it
        </button>
      </div>
      <ul className="space-y-1 text-[var(--secondary-text-color)]">
        {tips.map((t) => <li key={t}>· {t}</li>)}
      </ul>
    </aside>
  );
}
```

---

## Pattern 8 — Undo-after-clear

When the user just cleared their last item, offer a 5-second undo window
before showing the empty state.

```typescript
export function UndoAfterClear({ onUndo, autoHideMs = 5000 }: { onUndo: () => void; autoHideMs?: number }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), autoHideMs);
    return () => clearTimeout(t);
  }, [autoHideMs]);
  if (!visible) return null;
  return (
    <div className="mx-auto flex max-w-md items-center justify-between rounded-[var(--radius-medium)] bg-[var(--ui-background-color)] px-4 py-3 text-sm">
      <span>Last item cleared.</span>
      <button className="btn btn--ghost btn--sm" onClick={onUndo}>Undo</button>
    </div>
  );
}
```

Compose with an empty state below.

---

## Do-not

- **No blank white screens.** Even "we're building this" is better than
  nothing.
- **No sad stock illustrations.** They date fast. Use simple line icons
  (Lucide) or brand-consistent SVG.
- **No error screens that look like empty states** — users tap "Create" and
  hit another error. Different icon color (negative), different CTA (Retry
  vs Create).
- **No loading skeletons that don't match content shape.** Cause layout jump.
- **No first-run tips shown to returning users.** Persist dismissal in
  `localStorage`.
- **No empty state without an action.** Even "learn more" is an action.

---

## Checklist

- [ ] Every list/query has 4 states: loading (skeleton), empty (this skill),
      filter-empty (Pattern 2), error (Pattern 6)
- [ ] Empty state has at least one primary CTA
- [ ] Icon uses design-system tokens — no bespoke colored circles
- [ ] Illustration (if used) matches brand — no stock art
- [ ] Text is action-oriented ("Create your first…", not "You have no…")
- [ ] Filter-empty shows count of active filters
- [ ] Search-empty echoes the query
- [ ] Skeletons match final content shape
- [ ] `AnimatePresence` if the empty state fades in on state change
- [ ] Dark-mode parity
- [ ] `role="status"` on the empty state region for screen readers
