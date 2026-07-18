---
description: Frontend coding rules — RTK Query, Redux scope, component patterns, and the Aniston VMS soft-SaaS design system tokens.
---

# Frontend Coding Rules

Canon: docs/04-uiux-brief.md (v1.4) + docs/actual-design.png — the source of truth for every token/component
below. `.claude/skills/skill-ui-ux-checklist.md` has full token values and component primitives.

## API calls
- ALWAYS use RTK Query hooks — never raw fetch() or axios directly
- Every query endpoint MUST have `providesTags` (e.g. `Camera`, `Incident`, `HealthCheck`)
- Every mutation endpoint MUST have `invalidatesTags` (e.g. acknowledging an incident invalidates `Incident` and `Escalation`)
- Handle loading, error, and empty states for every query — an empty live-wall or incident list is not an error

## State management
- Redux store is ONLY for auth state and global UI state (e.g. selected zone in the sidebar, live-wall layout)
- All server data (cameras, incidents, health checks, recordings) lives in RTK Query cache — never copy it into Redux slices
- Never store sensitive data (passwords, tokens, camera credentials, PII) in Redux or localStorage

## Components
- Function components with hooks only — no class components
- Forms: use React Hook Form with a Zod resolver
- Show a Skeleton or Loader2 spinner during any loading state (e.g. live-wall tiles while a stream connects)
- Show a toast notification on mutation success and error (e.g. "Incident acknowledged", "Failed to escalate")

## Styling — Aniston VMS soft-SaaS design system
- Tailwind CSS only — no inline styles, no CSS modules, no styled-components
- Use existing utility classes from `globals.css` and `tailwind.config` — never hardcode a hex value inline
- **Canvas:** cream `var(--canvas-color)` = `#F6F5F1` behind every authenticated view
- **Sidebar:** slate, dark, fixed — houses org/site/zone navigation (`SidebarZoneItem`)
- **Cards:** white, rounded, elevated (`.card` / `.floating-card`) — every data surface (camera tile, incident
  card, maintenance task card) sits on a white rounded card over the cream canvas, never directly on it
- **Accents:** indigo (primary actions, links), coral (critical/incident/alert states), sand (warnings,
  degraded states) — never introduce a new accent color outside this trio without a design ADR
- **Radii / fonts / spacing:** exact values in `.claude/skills/skill-ui-ux-checklist.md` — do not eyeball them
- **Full spec:** `.claude/skills/skill-ui-ux-checklist.md` — all token values and component primitives
  (`PlayerShell`, `LiveWallGrid`, `TimelineScrubber`, `IncidentKanban`, `HealthScoreRing`, `StatusBadge`, …)

## Role-based UI
- Always check `user.role` (`SUPER_ADMIN` / `PROJECT_ADMIN` / `CLIENT_VIEWER`) before rendering admin-only
  components or actions (e.g. only PROJECT_ADMIN+ can edit camera credentials or reassign a zone)
- Also respect zone scope, not just role — a `CLIENT_VIEWER` or scoped `PROJECT_ADMIN` must never see a
  camera/site/zone outside their assigned `UserAccessScope` rows, even if the API were to leak it
- Use the `hasPermission()` helper from `@aniston-vms/shared/permissions`