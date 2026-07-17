# ADR 0002 — Glassmorphism UI Style with Sora / DM Sans / JetBrains Mono

**Status:** Superseded
**Date:** 2026-05-17
**Superseded by:** ADR-0008 — Monday Aniston Design System (2026-05-21)

> **DO NOT FOLLOW THIS ADR.** The glassmorphism system (indigo-600, Sora, DM Sans) was replaced
> by the Monday Aniston design system (primary #0073ea, Poppins, Figtree) before any app was built.
> Read `memory/decisions/ADR-0008-monday-aniston-design-system.md` for the current system.
> Read `skill-ui-ux-checklist.md` for all current token values.

## Context

The boilerplate's UI must look distinctive, modern, and consistent across web, Android, iOS, and the Electron desktop agent — without writing custom designs for each platform.

## Decision

**Visual style: glassmorphism (Monday.com-inspired)**

- Layered frosted-glass surfaces using `bg-white/60 backdrop-blur-md border border-white/30 shadow-glass`
- Subtle gradient app background (`bg-gradient-to-br from-slate-50 via-indigo-50 to-purple-50`)
- Soft, layered shadows (`shadow-glass`, `shadow-glass-lg`) rather than hard borders
- Generous padding and rounded corners (`rounded-xl` default)
- Reusable utility classes: `.glass-panel`, `.glass-card`, `.brand-button`, `.input-base` (in `frontend/src/styles/globals.css`)

**Brand color: indigo-600 `#4f46e5`**

- Tailwind palette mapped under `theme.colors.brand.{50..900}` so `bg-brand-600`, `text-brand-700` etc. work consistently
- Used for primary CTAs, active nav state, focus rings

**Typography**

- **Sora** — headings (weights 400, 500, 600, 700)
- **DM Sans** — body text (weights 400, 500, 700)
- **JetBrains Mono** — numbers, code, data tables (weights 400, 500)
- Loaded via Google Fonts `<link>` in `frontend/index.html`
- Tailwind families: `font-heading`, `font-body`, `font-mono`

**Animations: Framer Motion**

- Page enter: `initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}` (subtle)
- Modals / popovers: scale + fade
- Shared animation variants live in `frontend/src/lib/animations.ts`

## Consequences

**Positive**

- Strong visual identity that distinguishes the app from generic Material/Bootstrap clones
- Glassmorphism reads well on both light and dark backgrounds
- Single source of truth in Tailwind config + utility classes keeps the codebase consistent

**Negative**

- Backdrop-blur is GPU-expensive on low-end Android devices — must test perf on entry-level phones
- Glass effects can fail accessibility contrast checks if not carefully tuned (text on translucent backgrounds)
- Custom fonts add ~80KB initial network cost — mitigated by `preconnect` hints and `display=swap`

**Trade-offs**

- We picked indigo over a custom palette to ship faster. A real brand refresh is a future ADR.
- We chose Sora (not Inter) for headings to differentiate from the typical SaaS default look.
