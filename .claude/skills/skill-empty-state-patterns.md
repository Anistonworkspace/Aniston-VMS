# Skill — Modern Empty State Patterns

Empty states are the app's first impression on 40% of screens — a brand-new site with no cameras yet, a zone with zero open incidents, a report with no data in range. Every list, search result, filter, and detail page gets one. Modern empty states are minimal, action-oriented, and never blank.

Design tokens: see `docs/04-uiux-brief.md` (soft-SaaS — cream canvas, white rounded cards, sage/indigo/coral/sand accents). All animations respect `prefers-reduced-motion`.

---

## Base component

```tsx
// frontend/src/components/EmptyState.tsx
import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
  tone?: 'default' | 'success' | 'error';
}

export function EmptyState({ icon: Icon, title, description, action, secondaryAction, tone = 'default' }: EmptyStateProps) {
  const reduceMotion = useReducedMotion();
  const iconColor = tone === 'error' ? 'text-[var(--coral)]' : tone === 'success' ? 'text-[var(--sage)]' : 'text-[var(--muted)]';

  return (
    <motion.section
      role="status"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center justify-center text-center py-16 px-6"
    >
      <div className={`w-12 h-12 rounded-full bg-[var(--base-tint)] flex items-center justify-center mb-4 ${iconColor}`}>
        <Icon size={22} strokeWidth={1.75} />
      </div>
      <h3 className="text-base font-semibold text-[var(--ink)]">{title}</h3>
      {description && <p className="text-sm text-[var(--muted)] mt-1 max-w-sm">{description}</p>}
      <div className="flex items-center gap-2 mt-5">
        {action && <button onClick={action.onClick} className="btn btn-primary btn-sm">{action.label}</button>}
        {secondaryAction && <button onClick={secondaryAction.onClick} className="btn btn-ghost btn-sm">{secondaryAction.label}</button>}
      </div>
    </motion.section>
  );
}
```

## Pattern 1 — No cameras at this site (first-run)

```tsx
<EmptyState
  icon={VideoOffIcon}
  title="No cameras registered yet"
  description="Add the site's router and first camera to start monitoring. Aniston VMS runs an RTSP test connection before it goes live."
  action={{ label: 'Add camera', onClick: () => dispatch(openCreateModal({ type: 'camera' })) }}
  secondaryAction={{ label: 'Import from CSV', onClick: openImport }}
/>
```

`FirstRunTips`: for a brand-new `PROJECT_ADMIN` on their first site, show a 3-step checklist (register router → add camera → run test connection) instead of the plain empty state — dismissible, persisted per-user in `localStorage`.

## Pattern 2 — No open incidents in this zone (the good kind of empty)

```tsx
<EmptyState
  icon={ShieldCheckIcon}
  tone="success"
  title="No open incidents in this zone"
  description="All cameras are healthy. New incidents will appear here the moment a health check fails."
/>
```

Don't dress this one up with a call-to-action — an all-clear zone dashboard is a positive result, not a dead end. There is no "create incident" button anywhere in the app: incidents are system-detected from health checks, never user-authored.

## Pattern 3 — Search: no camera/zone matches

```tsx
<EmptyState
  icon={SearchXIcon}
  title={`No results for "${query}"`}
  description="Try a camera code (CAM-042), zone name, or site name."
  action={{ label: 'Clear search', onClick: onClear }}
/>
```

## Pattern 4 — Filtered incident list is empty

```tsx
<EmptyState
  icon={FilterXIcon}
  title="No incidents match these filters"
  description={`${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'} applied`}
  action={{ label: 'Clear filters', onClick: onClearFilters }}
/>
```

### Undo-after-clear

```tsx
function onClearFilters() {
  const prevFilters = filters;
  setFilters(defaultFilters);
  const toastId = toast.info('Filters cleared', {
    action: { label: 'Undo', onClick: () => { setFilters(prevFilters); toast.dismiss(toastId); } },
    duration: 5000,
  });
}
```

## Pattern 5 — Error state (health check / API failure)

```tsx
<EmptyState
  icon={AlertTriangleIcon}
  tone="error"
  title="Couldn't load incidents"
  description="The dashboard couldn't reach the API. Check your connection and try again."
  action={{ label: 'Retry', onClick: onRetry }}
  secondaryAction={{ label: 'Contact support', onClick: openSupport }}
/>
```

Never show a raw stack trace or `err.message` to a `CLIENT_VIEWER` — sanitize to the copy above and log the real error server-side with the correlation id (see `agent-observability` conventions).

## Pattern 6 — Loading skeleton (shares the same slot)

Skeleton matches the eventual shape — rounded `--card-radius` blocks sized like a real `IncidentCard` / `CameraCard` / `ActivityListCard` — never a plain spinner for list content. A spinner is fine inside a button, not for a whole page.

## Checklist

- [ ] Every list/search/filter/detail screen has an explicit empty state — none fall through to a blank canvas area
- [ ] Icon + title + optional description + at most one primary action — no walls of text
- [ ] "No open incidents" reads as good news (sage tone, no CTA) — don't reuse the generic gray empty-state look for a positive result
- [ ] Filter-empty always offers "Clear filters"; destructive clears (losing scroll position, etc.) get an Undo toast
- [ ] Error states never leak raw error messages to the `CLIENT_VIEWER` role; always offer Retry
- [ ] First-run tips dismiss permanently once completed, tracked per-user not per-session
- [ ] `motion`/`AnimatePresence` transitions respect `prefers-reduced-motion` via `useReducedMotion()`
- [ ] Empty-state icon uses a `--base-tint` background circle + a token color — never a raw illustration outside the design system