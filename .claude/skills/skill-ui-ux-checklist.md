---
name: skill-ui-ux-checklist
description: Boilerplate Design System conformance checklist. 24 sections covering every token value (color hex, font, spacing, shadow, animation timing). Use before and after any UI change. Pair with agent-ui-ux.md.
---

# UI/UX Conformance Checklist — Boilerplate Design System

Use **before** a UI change (to plan against the spec) and **after** a UI change (to verify nothing regressed).

Mark each item: **Pass** / **Fail** / **Needs verification**. Do not skip sections.

---

## 1. Shell signature — floating card on tan base

- [ ] Root layout background paints `var(--base-tint)` — light `#f1ece3`, dark `#231f1a`
- [ ] Main content wrapped in `.floating-card .floating-card--stuck` (white bg, 14px top-corner radius, layered shadow, flush right + bottom)
- [ ] Visible **tan strip** between sidebar and floating card (`pl-1.5` or equivalent on main column)
- [ ] Card shadow visible on left edge and underneath (not on right/bottom — flush)
- [ ] Sidebar background transparent over tan base, right border dropped
- [ ] Header background transparent over tan base, bottom border dropped
- [ ] `.page-enter` animation plays on route change (250ms, opacity + 6px translateY)

## 2. Design tokens

- [ ] `--primary-color: #0073ea` used for primary buttons, focus rings, active-route highlights
- [ ] `--primary-hover-color: #0060b9` used for primary hover
- [ ] Text tokens: primary `#323338`, secondary `#676879`, tertiary `#c5c7d0`, muted `#c4c4c4`
- [ ] Background tokens: primary `#ffffff`, allgrey `#f6f7fb`, backdrop `rgba(41, 47, 76, 0.7)`
- [ ] Border tokens: layout `#d0d4e4`, ui `#c3c6d4`, ui-bg `#e7e9ef`
- [ ] Status tokens: positive `#00854d`, negative `#d83a52`, warning `#ffcb00`
- [ ] Shell tokens: `--base-tint`, `--card-bg`, `--card-radius: 14px`, `--card-shadow` (layered)
- [ ] Radii: small `4px`, medium `8px`, big `16px` — no other values in use
- [ ] Shadows: xs / small / medium / large — no bespoke `0 X Y rgba(...)` outside `.floating-card`
- [ ] Motion tokens: productive 70/100/150ms, expressive 250/400ms, easing `cubic-bezier(0.16, 1, 0.3, 1)`
- [ ] Dark mode via `.dark` on `<html>` or `<body>` — overrides every token
- [ ] No hex literals outside the spec (any found → mark Fail, propose token replacement)

## 3. Typography

- [ ] Body font: `Figtree, Roboto, "Noto Sans Hebrew", "Noto Kufi Arabic", "Noto Sans JP", sans-serif`
- [ ] Heading font: `Poppins, Roboto, "Noto Sans Hebrew", "Noto Kufi Arabic", "Noto Sans JP", sans-serif`
- [ ] Google Fonts `@import` present at top of global stylesheet (Figtree 300–800 + Poppins 500/600/700 + Roboto 300/400/500/700)
- [ ] Root font-size `15px` via `--app-font-base`
- [ ] Font scale: xxs 10 / xs 12 / sm 13 / base 14 / md 15 / lg 17 / xl 20 / 2xl 24 / 3xl 30
- [ ] No `Inter` introduced. No `system-ui` as primary font.
- [ ] H1/H2/H3 use Poppins via `--font-h1/h2/h3` tokens
- [ ] Body text uses 14px family on dense surfaces, 16px on spacious
- [ ] Tabular numerals on data counts, badge numbers, timers, percentages
- [ ] Truncation rules consistent (`truncate` / `line-clamp-N`)

## 4. Sidebar

- [ ] Expanded width 256px, collapsed 52px, transition `280ms cubic-bezier(0.4, 0, 0.2, 1)`
- [ ] Logo block: 28×28 logo + 13px bold app name + PanelLeftClose button + bottom border `1px solid var(--sidebar-border)`
- [ ] `.sidebar-item` primitive: gap-2.5, px-3 py-[6px], 14px font, rounded-md, mx-2
- [ ] Active state: `--primary-selected-color` bg (`#cce5ff`) + `--primary-color` text + `font-weight: 500`
- [ ] Hover state: `--sidebar-hover` bg + `--sidebar-text-active` color
- [ ] Section dividers: `border-top: 1px solid var(--sidebar-border)`, margin `1px 12px`
- [ ] Section labels: 11px, uppercase, tracking-wide, 60% opacity, chevron toggle
- [ ] Badge on nav item: `--negative-color` bg (red), 9px bold white, `min-w-[18px] h-[16px]`, `ml-auto`
- [ ] Mobile (≤767px): fixed drawer, `-translate-x-full ↔ translate-x-0`, backdrop `bg-black/40 z-40`, panel `z-50 shadow-2xl`
- [ ] Auto-collapses on route change on mobile
- [ ] User pill at footer: `border-top`, avatar + name + tier badge, fixed (does not scroll with nav)
- [ ] Lucide icons: `size={14-16}`, `strokeWidth={1.8}`

## 5. Header

- [ ] Height exactly **48px**, `var(--primary-background-color)` bg, `border-bottom: 1px solid var(--layout-border-color)`
- [ ] Left cluster: mobile hamburger (md:hidden) + breadcrumb `"AppName / PageTitle"` + command palette trigger
- [ ] Breadcrumb separator `/`, app name `--text-tertiary`, page title `--primary-text-color font-medium`
- [ ] Command palette trigger: Search icon (14px) + "Search…" (12px) + `⌘K` kbd hint (10px, lg:inline only)
- [ ] Right icon buttons: `p-2 rounded-lg`, lucide `size={17} strokeWidth={1.8}`, `--text-tertiary` → `--primary-text-color` hover
- [ ] Active-route icon: `--primary-color` text + permanent hover bg
- [ ] Notification badge: top-1 right-1, `--negative-color` bg, white 8px bold, `min-w-[14px] h-[14px] rounded-full ring-2 ring-[var(--primary-background-color)]`, capped `9+`
- [ ] User pill: 28×28 gradient avatar + first name (md:inline) + 12px ChevronDown
- [ ] All icon-only buttons have BOTH `title` and `aria-label`
- [ ] Notification button has `aria-expanded` + `aria-haspopup="dialog"`

## 6. Buttons

- [ ] `.btn` primitive used — no inline button styling
- [ ] Heights: xxs 16px / xs 24px / sm 32px / md 40px / lg 48px
- [ ] `.btn:active`: `transform: scale(0.95)` (70ms snap)
- [ ] `.btn:focus-visible`: ring `0 0 0 3px hsla(209, 100%, 50%, 0.5)`
- [ ] Disabled: `--disabled-background-color` + `--disabled-text-color`, `cursor: not-allowed`, `pointer-events: none`
- [ ] Primary: `--primary-color` bg, white text, `--primary-hover-color` hover
- [ ] Secondary: transparent bg, `--ui-border-color` border, `--primary-background-hover-color` hover
- [ ] Ghost/tertiary: transparent bg + transparent border, `--primary-background-hover-color` hover
- [ ] Positive: `--positive-color` bg, white text
- [ ] Negative: `--negative-color` bg, white text
- [ ] Icon-only buttons use `.btn--icon` (width = height)

## 7. Status & priority pills

- [ ] `.status-pill` primitive: full-width, 34px min-height, py-[6px], 13px font, white text, `brightness(1.06)` hover
- [ ] Status colors: `not_started #c4c4c4` / `working_on_it #fdab3d` / `in_progress #0073ea` / `stuck #df2f4a` / `done #00c875` / `review #9d50dd` / `pending_deploy #9d50dd` / `ready_to_start #fdab3d` / `waiting_for_review #fdab3d`
- [ ] Priority colors: `low #579bfc` / `medium #fdab3d` / `high #ff7575` / `critical #bb3354`
- [ ] No second pill family — every pill in the app uses `.status-pill` or `.badge`

## 8. Badges

- [ ] `.badge` primitive: gap-1, px-2 py-0.5, 11px font-medium, rounded-md
- [ ] Variants: primary / success / warning / danger / purple / neutral
- [ ] Tier mapping: Tier 1 → danger, Tier 2 → warning, Tier 3 → primary, Tier 4 → neutral
- [ ] Dark-mode parity: each variant has a dark-mode bg override (alpha-blended)

## 9. Avatars

- [ ] Default (28×28): `rounded-lg`, gradient `linear-gradient(to bottom right, var(--primary-color), #3d99f0)`, white 11px semibold initial, `shadow-sm`
- [ ] Small (24×24): `rounded-md`, 10px text
- [ ] Image variant: same container, `object-cover`, optional `ring-2 ring-white`
- [ ] Stacked (table cells): `-ml-1.5` overlap, each `ring-2 ring-white`
- [ ] No second avatar implementation

## 10. Inputs

- [ ] `.input-field` primitive: 14px font, px-3 py-2, `--bg-elevated` bg, `--border-color` border, `--border-radius-medium`
- [ ] Placeholder: `--text-muted`
- [ ] Focus ring: 2px halo of `--primary-highlighted-color`, border swaps to `#7fbcf8` (primary-300)
- [ ] Compact variant (`.form-input-compact`): 13px, py-1.5, 4px radius — used inside modals
- [ ] Required indicator and helper text styled consistently
- [ ] Inline error below the field — not a blocking banner
- [ ] `aria-describedby` pointing at error element

## 11. Tabs

- [ ] `.tabs-compact` + `.tab-trigger-compact` used for page-tab rows
- [ ] Active: `--primary-color` text + 2px bottom border in `--primary-color`
- [ ] Inactive: `--secondary-text-color` text, transparent bottom border
- [ ] Container bottom border: `1px solid var(--border-color)`
- [ ] Horizontal scroll on overflow, scrollbar hidden

## 12. Modals

- [ ] Backdrop `.detail-modal-backdrop`: `rgba(15, 23, 42, 0.45)`, `backdrop-filter: blur(2px)`, 180ms ease-out
- [ ] Full-bleed dialogs: `var(--backdrop-color)` = `rgba(41, 47, 76, 0.7)`
- [ ] Panel: `--modal-background-color`, `1px solid var(--layout-border-color)`, `--border-radius-medium`, `--box-shadow-large`
- [ ] Center-enter: 220ms `cubic-bezier(0.16, 1, 0.3, 1)`, opacity + scale(0.98→1) + translateY(40px→0)
- [ ] Sizes via fixed max-widths: sm/md/lg/xl/full (no bespoke `max-w-[XYZ]`)
- [ ] `.modal-header-compact`, `.modal-body-compact`, `.modal-footer-compact` used
- [ ] Modal title chip: 28×28, rounded-md, primary-highlighted bg + primary-color icon
- [ ] Footer: subtle `rgba(246, 247, 251, 0.6)` tint
- [ ] z-index: 10000 (`var(--modal-z-index)`)
- [ ] Focus trap: Tab cycles, Shift+Tab reverses
- [ ] Esc closes only the topmost surface
- [ ] Body scroll locked while open
- [ ] Focus restored to trigger on close
- [ ] Portal-rendered to `document.body`
- [ ] Mobile: bottom-sheet slides up from `translateY(100%)` in 280ms
- [ ] Reduced motion: enter/exit animations disabled

## 13. Dropdowns / popovers

- [ ] `.dropdown-panel`: `--dialog-background-color` bg, `1px solid var(--layout-border-color)`, radius medium, shadow medium
- [ ] `.dropdown-enter`: 180ms, opacity + scale(0.97) + translateY(-6px) → 1 / 0
- [ ] `.dropdown-item`: gap-2.5, px-3 py-2, 14px, secondary text → primary text hover, `--ui-background-color` hover bg
- [ ] Danger items: `--negative-color` text + soft red hover bg
- [ ] Widths: 224px (`w-56`) menus, 240px (`w-60`) user menu, ~360px notification panel
- [ ] Portal-rendered when trigger is inside `overflow:hidden` ancestor
- [ ] Auto-flip upward when no room below; horizontal clamp to viewport
- [ ] Escape + outside-click close

## 14. Tables / board surface

- [ ] Row: `display: flex`, `border-bottom: 1px solid var(--border-color)`, `transition: all 0.15s ease`
- [ ] Default bg `#ffffff`, hover `#f5f6f8`
- [ ] Overdue: `bg-[#fff5f6] hover:bg-[#ffeaee]` (dark `#352024 / #3f2730`)
- [ ] Selected: `bg-[#e6f0ff] hover:bg-[#dbeaff]` (dark `#1a2942 / #1f3253`)
- [ ] 6px group-color stripe on left edge at **0.6 opacity**, sticky-left z-20
- [ ] 40px gutter for checkbox / drag handle
- [ ] Task-title cell sticky-left, inherits row bg
- [ ] Age pill: 11px, `bg-[#f6f7fb] text-[#676879] rounded-full px-1.5 py-0.5`
- [ ] Status / priority cells use `.status-pill` with exact §7 colors
- [ ] Owner cell: stacked avatars with `-ml-1.5 ring-2 ring-white`
- [ ] Progress cell: 6px track, fill from `getProgressColor(pct)`, 11px `#676879` label
- [ ] Group color stripe: full opacity in group header, 0.6 in rows, 0.3 in "+ Add task" footer
- [ ] Summary bar: `border-left: 3px solid <group-color>`, `rounded-b-lg`
- [ ] Sticky-left columns work during horizontal scroll (no seams, no transparent bg)
- [ ] Bulk action UI only when rows are selected

## 15. Toasts

- [ ] Position: **top-center**, `pointer-events: none` (individual toasts re-enable)
- [ ] Durations: success 3s / info 4s / warning 5s / error 6s
- [ ] Stack limit 5 (oldest dropped); dedup window 1500ms
- [ ] Success: `--positive-color` bg + white text
- [ ] Error: `--negative-color` bg + white text + `role="alert" aria-live="assertive"`
- [ ] Warning: `--warning-color` bg + `#323338` text
- [ ] Info: `--inverted-color-background` bg + white text
- [ ] `.animate-slide-up` enter: 300ms `cubic-bezier(0.16, 1, 0.3, 1)`
- [ ] Click-through routing supported for notification toasts

## 16. Empty / loading / error states

- [ ] Empty: 48-64px lucide icon in `--text-muted` + 13-14px secondary text + optional primary CTA
- [ ] Loading: `.skeleton` shimmer for content blocks; spinner only for inline button progress
- [ ] No blank flash between loading and loaded (skeleton while data fetches)
- [ ] Error boundary wraps risky subtrees (route pages, board view, modal contents)
- [ ] Permission denied (403) surface: icon + "You don't have access" + back link — never silent
- [ ] No raw `alert()` — every error goes through toast / banner / dialog

## 17. Animation conformance

- [ ] Canonical easing `cubic-bezier(0.16, 1, 0.3, 1)` for every smooth enter
- [ ] Page enter: 250ms
- [ ] Modal enter (center): 220ms
- [ ] Modal enter (bottom-sheet): 280ms
- [ ] Modal backdrop: 180ms ease-out
- [ ] Dropdown enter: 180ms
- [ ] Slide-in-right (drawer/panel): 300ms
- [ ] Toast slide-up: 300ms
- [ ] Sidebar width: 280ms `cubic-bezier(0.4, 0, 0.2, 1)`
- [ ] Mobile drawer slide: 200ms
- [ ] Button press snap: 70ms `scale(0.95)`
- [ ] Status pill hover: 100ms `filter: brightness(1.06)`
- [ ] No new animation library introduced
- [ ] `prefers-reduced-motion` short-circuits everything via global block

## 18. Accessibility

- [ ] Skip-to-main-content link is the first focusable element
- [ ] `:focus-visible` ring active everywhere — never `outline: none` alone
- [ ] Every icon-only button has `aria-label` AND `title`
- [ ] Count badges: `aria-live="polite" aria-atomic="true"`
- [ ] Toasts: `role` + `aria-live` correct (alert/assertive for errors, status/polite otherwise)
- [ ] Modals: `role="dialog" aria-modal="true" aria-labelledby="<title-id>"`
- [ ] Form inputs have `<label>` or `aria-label`
- [ ] Inline errors use `aria-describedby`
- [ ] Keyboard: Tab / Shift+Tab / arrow keys / Esc closes topmost surface
- [ ] Color contrast WCAG AA in both themes
- [ ] Tables/grids use correct roles (`role="grid"`, header `scope`)

## 19. Responsive / mobile

- [ ] Tailwind breakpoints: sm 640 / md 768 / lg 1024 / xl 1280
- [ ] Sidebar drawer on `≤md` with backdrop
- [ ] Header sub-separators hidden on `<sm`
- [ ] Breadcrumb app name + user name hidden on `<md`
- [ ] `⌘K` kbd hint shown on `≥lg` only
- [ ] Touch targets ≥44×44 on mobile (icon buttons `p-2.5` below `sm`)
- [ ] Safe-area insets respected on bottom-sheet modal and floating action button
- [ ] No hover-only interactions on mobile-critical paths

## 20. Theme parity

- [ ] Every new color resolves in BOTH `.dark` AND light
- [ ] `bg-white`, `text-gray-*` patterns have matching `.dark` overrides
- [ ] Modal backdrop, dropdown bg, sidebar tokens all switch correctly
- [ ] Floating-card shadow swaps to heavier dark variant
- [ ] Theme toggle persists (localStorage) + applies synchronously (no flash on reload)

## 21. State / data sync

- [ ] Optimistic updates revert on server error + show a toast
- [ ] Realtime events patch local RTK Query cache (not full refetch)
- [ ] Multi-tab session changes reflected via socket / storage event
- [ ] Loading / error / success are mutually exclusive
- [ ] Cache invalidation is targeted, not global
- [ ] Realtime handlers unsubscribe on unmount

## 22. Performance

- [ ] Long lists use pagination / virtualization (>200 rows)
- [ ] No N+1 fetch patterns in row render path
- [ ] Skeleton shown during fetch — no blank flashes
- [ ] Images use `loading="lazy"` + sized container
- [ ] Animation cost on long lists measured (60fps target)
- [ ] Bundle impact justified for any new dependency

## 23. Security / privacy UX

- [ ] Sensitive fields not auto-revealed — explicit "show" affordance
- [ ] Destructive actions require confirmation modal
- [ ] PII not exposed in error messages or logs
- [ ] File uploads honor MIME/size/extension allowlist with visible feedback
- [ ] Permission denials shown clearly — not silent

## 24. Regression-risk hotspots (always re-verify when touched)

- [ ] Sticky-positioned columns / headers (board table)
- [ ] 6px group-color stripe alignment after row-state changes
- [ ] Floating-card border-radius (top corners only when stuck — bottom corners flat)
- [ ] Modal focus trap when nested
- [ ] z-index: sidebar drawer `z-50`, header `z-20`, dropdown `z-[100]`, modal `z-[10000]`, skip-link `z-[9999]`
- [ ] Dark-mode tokens for newly-introduced colors
- [ ] Mobile drawer auto-collapses on route change
- [ ] Realtime sync between board and open modal
- [ ] Theme toggle without flash of unstyled content
- [ ] Notification badge ring color matches icon's background

---

## Required output format when this skill is invoked

Respond in this order:

1. **Visual reference noted** — if screenshots were provided, name the surface.
2. **Current UI understanding** — one or two sentences on surface and intent.
3. **Files inspected** — bulleted list with `[file.tsx:line](path#Lline)` references.
4. **Spec section reused** — name the token / primitive / §section this change rides on. If not yet installed, install it first.
5. **Checklist result** — relevant sections marked `Pass` / `Fail` / `Needs verification`, one-line reason for each non-Pass.
6. **Recommended change** — short description + which spec rules it honors.
7. **Exact implementation plan** — file-by-file, line-anchored, smallest possible edits. Quote exact CSS / JSX.
8. **Acceptance criteria** — what "done" looks like visually and behaviorally.
9. **Risk / edge cases** — theme parity, focus trap, mobile drawer, reduced motion, sticky columns, modal z-index, §24 hotspots.
10. **Test checklist** — manual + automated steps.
11. **Approval gate** — do NOT proceed with code changes until the user approves, UNLESS explicitly asked to implement.

---

## §25. Modern-UI pattern library (added Phase 3 of boilerplate v2)

For landing pages, dashboards, and any "reactbits-tier" surface, reach for one
of the modern skill files below FIRST. They ship reactbits/Aceternity/Magic UI
aesthetic while staying inside the existing tokens (§1–§24).

| Skill | Use when… |
|---|---|
| `skill-modern-hero-patterns.md` | Landing hero, top-of-page banner, dashboard header |
| `skill-modern-layout-patterns.md` | Bento grid, marquee logo strip, sticky-scroll story, parallax, magnetic buttons |
| `skill-modern-motion-patterns.md` | Advanced Framer Motion — shared layout, stagger, spring presets, motion values, count-up numbers, scroll progress |
| `skill-command-palette-patterns.md` | Cmd+K palette with recent-first, async results, sub-menus |
| `skill-drag-drop-patterns.md` | Sortable list, kanban board, file drop zone, multi-select drag (dnd-kit) |
| `skill-empty-state-patterns.md` | Every list/query/filter/search/error empty state |
| `skill-onboarding-flow-patterns.md` | Multi-step signup, first-run setup, guided tour |

**Do-not:** don't over-motion. Every animation short-circuits under
`prefers-reduced-motion` (built into every pattern above). Reserve
`skill-modern-motion-patterns` for accent moments — not every page.
