---
name: skill-ui-ux-checklist
description: Aniston VMS UI/UX conformance checklist. 24 sections covering every token, color, spacing, radius, shadow, motion-timing, and component-usage rule in the soft-SaaS design system. Use before and after any UI change — pair with agent-vms-uiux for a full audit.
---

# Skill: UI/UX Conformance Checklist

Design system: **soft-SaaS** — slate sidebar, cream canvas, white rounded cards, sage/indigo/coral/sand
accents. Canonical sources (read these first, in this order): `.claude/agents/agent-vms-uiux.md` (token +
component reference), `docs/04-uiux-brief.md` (design language, v1.4), `docs/actual-design.png` (pixel
reference). This checklist exists so no PR silently regresses back to the old Monday.com-blue
"Boilerplate Design System." Pair with `agent-vms-uiux` for a full audit; use this file yourself before
opening a PR.

---

## 1. Core palette (memorize these — never hardcode a hex outside `:root`)

| Token | Hex | Use |
|---|---|---|
| `--canvas` | `#E8E8E6` | Outermost page bleed (app is edge-to-edge — no floating outer frame) |
| `--surface` | `#F6F5F1` | Main content background (cream) |
| `--card` | `#FFFFFF` | Cards, rows, topbar, modals, inputs |
| `--sidebar` | `#5C6672` | Sidebar background (slate) |
| `--sidebar-text-active` | `#F3F4F5` | Active nav item text/icon on sidebar |
| `--sidebar-text-muted` | `#C6CCD2` | Inactive nav item text/icon on sidebar |
| `--ink` | `#21201E` | Primary text |
| `--muted` | `#8A8F94` | Secondary text, icon default, placeholders |
| `--hairline` | `#ECEAE4` | Borders, dividers, table rules |
| `--charcoal` | `#2B2724` | Video/player chrome (`PlayerShell`, `VideoTile` letterbox) |

## 2. Accent palette

| Token | Hex | Use |
|---|---|---|
| `--sage` | `#8FBCA0` | Primary actions (`PrimaryCTA`), healthy-state accent |
| `--sage-hover` | `#7FAE92` | Hover/active for sage surfaces |
| `--indigo` | `#484C89` | Secondary accent, maintenance-state accent |
| `--coral` | `#F25B3D` | Critical/alert/destructive actions |
| `--sand` | `#EFE3C0` | Tertiary accent, soft decorative fills |
| `--sand-deep` | `#C9A94E` | Tertiary accent, deep — icon/border on sand |

**Never** introduce a color outside this set (no random purple/blue gradients, no new brand hue). If a new
semantic meaning is needed, reuse the closest accent — don't invent a 7th color.

## 3. Status semantics (`StatusBadge`, `StatusDot`, `HealthScoreRing`)

| Status | Foreground | Background |
|---|---|---|
| Healthy | `#4E9C77` | `#E7F1EA` |
| Warning | `#E2A93B` | `#FBF3DF` |
| Critical | `#F25B3D` | `#FDE7E1` |
| Maintenance | `#484C89` | `#E6E7F3` |
| Unknown / Offline | `#9AA1A9` | `#F0F0EE` |

- [ ] Every camera/incident status renders through `StatusBadge` or `StatusDot` — never a raw colored `<span>`
- [ ] Status color always comes from this table — never `--coral` used for "warning" or `--sand` for "critical"
- [ ] `StatusDot` is an 8px filled circle, no ring/border

## 4. Radius scale

| Token | Value | Use |
|---|---|---|
| `--radius-card` | `20px` | Cards, panels, modals, dialogs |
| `--radius-tile` | `14px` | Inner tiles, list-row icons, toasts |
| `--radius-control` | `12px` | Buttons, inputs, selects, dropdown panels |
| `--radius-pill` | `9999px` | Badges, chips, `StatusBadge`, avatars, `ScopeBadge` |

- [ ] App frame itself is **edge-to-edge with zero radius** — no outer rounded shell, no floating card
  wrapping the whole app (that look died with the Boilerplate Design System)
- [ ] Nothing uses an arbitrary radius like `rounded-xl`/`rounded-2xl` without mapping to one of the 4 tokens above

## 5. Shadow

```css
--shadow-soft: 0 10px 30px rgba(33, 32, 30, 0.07);
--shadow-soft-hover: 0 10px 30px rgba(33, 32, 30, 0.10);
```

- [ ] Exactly one shadow scale — no `shadow-sm`/`shadow-md`/`shadow-lg`/`shadow-xl` tiers, no `--box-shadow-large`
- [ ] Never a hard/dark drop shadow (`0 4px 6px rgba(0,0,0,.3)` etc.) — everything is soft and diffuse
- [ ] Hover raises opacity from `.07` → `.10` only; it does not change offset or blur radius

## 6. Spacing & layout rhythm

- [ ] Card internal padding is `24px` (`p-6`)
- [ ] Grid/section gaps are `24px` (`gap-6`)
- [ ] Base spacing unit is Tailwind's default `4px` scale — no custom `--gap` overrides per component
- [ ] Sidebar width is fixed (see `AppShell`); content area scrolls independently of sidebar and topbar

## 7. Typography

- [ ] Headings (`HeroHeader`, card titles, page titles) use **Poppins** 600/700 — never Figtree, never Inter for headings
- [ ] Body/UI text uses **Inter** 400/500/600 at 14–15px
- [ ] All numeric readouts (uptime %, camera counts, incident IDs, timestamps) use `tabular-nums`
- [ ] Hero-scale headline: 34–40px; card title: 20px; body: 14–15px; micro-label (sidebar section headers, table headers): 11–12px uppercase, `--muted`, letter-spacing wide

## 8. Icons

- [ ] `lucide-react` only, 20px (`h-5 w-5`), `strokeWidth={1.5}`
- [ ] Default icon color is `--muted`; active/selected nav icon is `--sidebar-text-active`; never a filled icon glyph

## 9. Buttons (`PrimaryCTA` / `.btn` primitive)

- [ ] `.btn--primary` = `--sage` fill, white text, `--sage-hover` on hover
- [ ] `.btn--secondary` = `--card` fill, `--hairline` border, `--ink` text
- [ ] `.btn--ghost` = transparent, `--muted` text, `--surface` on hover
- [ ] `.btn--positive` maps to `--sage`, `.btn--negative` maps to `--coral` — no separate green/red brand hues
- [ ] Radius is `--radius-control` (12px); disabled state is `--muted` text on `--surface`, `not-allowed` cursor
- [ ] Every button with only an icon has an accessible label (`aria-label` or visually-hidden text)

## 10. Inputs & forms

- [ ] Inputs are `--card` background, `--hairline` border, `--radius-control` (12px), `--ink` text, `--muted` placeholder
- [ ] Focus ring uses `--sage` at reduced opacity — never a browser-default blue outline
- [ ] Validation errors show inline below the field in `--coral`, with `zodResolver`/`react-hook-form` `formState.errors`, not a blocking alert
- [ ] Required fields are marked; disabled fields are visually distinct (`--surface` bg, `--muted` text)

## 11. Cards & surfaces

- [ ] Every card (`ZoneCard`, `CameraCard`, `DonutCard`, `ActivityListCard`, `MaintenanceTaskCard`,
  `PlatformHealthTile`, `EvidencePhotoCard`, generic list/report cards) is `--card` background,
  `--radius-card` (20px), `--shadow-soft`, `--hairline` 1px border
- [ ] Card hover (when interactive) raises to `--shadow-soft-hover` — no scale/translate jump beyond ~1–2px
- [ ] No card ever uses the legacy `.floating-card` class name or an arbitrary `rounded-[28px]` outer shell

## 12. Tables

- [ ] Table lives inside a card (`--radius-card`), wrapped in `overflow-x-auto`
- [ ] Header row: 11–12px uppercase `--muted` text, `--hairline` bottom border, sortable columns show a chevron
- [ ] Row divider is `--hairline`; row hover background is `--surface`; selected row background is `--sage`
  at low opacity (reuse the Healthy-status soft bg, `#E7F1EA`, for the selected tint — don't invent a new one)
- [ ] Status column always renders `StatusBadge`, never raw text
- [ ] Skeleton rows (not a spinner) while loading; descriptive empty state with a CTA, not bare "No data"
- [ ] Pagination shows "Showing X–Y of Z"; mobile (`<640px`) falls back to a stacked card list, not a squeezed table

## 13. Modals & dialogs

- [ ] Backdrop is `--ink` at low opacity (e.g. `rgba(33,32,30,.4)`), never pure black
- [ ] Dialog surface is `--card`, `--radius-card`, `--shadow-soft-hover`
- [ ] Focus is trapped inside the dialog; `Escape` closes it; focus returns to the trigger element on close

## 14. Sidebar / navigation (`AppShell`, `SidebarZoneItem`, `ZoneTree`)

- [ ] Sidebar background is `--sidebar` (slate `#5C6672`), never white or cream
- [ ] Active nav item: `--sidebar-text-active` text/icon, with a subtle highlighted row background (not a hard pill)
- [ ] Inactive nav item: `--sidebar-text-muted`
- [ ] Zone hierarchy (`ZoneTree`) is collapsible; depth is shown with indentation, not color
- [ ] Topbar sits on `--card`, separated from content by `--hairline`, and never duplicates sidebar nav

## 15. Motion

- [ ] Row/card hover/selection transitions run **70–160ms**, `ease`/`easeOut` — no default-browser 300ms+ linear transitions
- [ ] Every `motion.*`/`AnimatePresence` usage respects `useReducedMotion()` — reduced-motion users get instant/opacity-only transitions, never a hard skip that breaks layout
- [ ] Stagger delays on lists (`StaggerList`, zone lists, incident kanban) are ≤ 40ms per item — never a slow multi-second cascade
- [ ] No animation blocks interaction — content is usable before the animation finishes

## 16. Loading, empty & error states

- [ ] Loading: skeleton blocks matching final content shape — never a full-page spinner for a partial region
- [ ] Empty: an icon + one-line message + a primary action (e.g. "No cameras in this zone yet — Add camera")
- [ ] Error: a `DiagnosisBanner`-style inline banner (`--coral` accent, retryable), never a raw stack trace or browser `alert()`

## 17. Notifications & toasts

- [ ] Toast surface is `--card`, `--radius-tile` (14px), `--shadow-soft`, left accent bar in the relevant status color
- [ ] Auto-dismiss after 4–6s unless it's a critical incident alert (those persist until acknowledged)
- [ ] Toasts stack, most-recent on top, and are dismissible by click/swipe

## 18. Dropdowns, tabs, filter chips

- [ ] Dropdown panel: `--card`, `--radius-control`, `--shadow-soft`, `--hairline` border, closes on outside click / `Escape`
- [ ] Tabs (`TabsWithSharedIndicator` for camera detail: Overview/Health/Live/Playback/Incidents/Settings) use a single animated indicator — never per-tab background swap
- [ ] `FilterChips` (zone/status/type) use `--radius-pill`, `--surface` default / `--sage` soft-bg when active, with a clear "×" to remove

## 19. Accessibility

- [ ] Color is never the only signal — status always pairs a dot/badge with text ("Critical", "Healthy"), not color alone
- [ ] All interactive elements are keyboard-reachable in a logical tab order; visible focus ring (`--sage`, not removed via `outline: none`)
- [ ] Contrast: `--ink` on `--surface`/`--card` passes AA; `--muted` on `--card` passes AA for body text size
- [ ] Live regions (`aria-live="polite"`) for incident/notification updates that arrive without user action

## 20. Responsive / mobile

- [ ] Sidebar collapses to an overlay/drawer below `md` breakpoint; content becomes full-width
- [ ] Tables collapse to stacked cards below `sm`; camera grids (`LiveWallGrid`) reflow from 3–4 columns to 1–2
- [ ] Touch targets are ≥ 40px; hover-only affordances (e.g. row action menus) also have a tap-visible fallback

## 21. Copy & domain nouns

- [ ] Sample/placeholder data is VMS-real: cameras (`CAM-042`, `ANI-CAM-2026-000145`), zones, incidents
  (`CAMERA_OFFLINE`, `RTSP_AUTHENTICATED`, `RECOVERY_VERIFIED`...), roles `SUPER_ADMIN` / `PROJECT_ADMIN` /
  `CLIENT_VIEWER` — never `notes`, `Item`, or `John Doe`
- [ ] Button/action copy is operator-facing and concrete ("Acknowledge incident", "Open Live Wall",
  "Export health report") — not generic "Submit"/"Save changes" everywhere

## 22. Forbidden — fail review immediately if any of these appear

- [ ] `#0073ea` or any Monday.com-blue hex
- [ ] `Figtree` as a font family
- [ ] `.floating-card` class name or `--card-radius`/`--card-shadow`/`--card-bg`/`--font-h1`/`--app-font-base`/`--text-muted`/`--text-tertiary`/`--bg-elevated`/`--base-tint` token names
- [ ] The literal strings `"Boilerplate Design System"`, `@boilerplate`, `design-reference.jpeg`
- [ ] `\bnotes\b`, `\bItem\b`, `"John Doe"` used as sample domain data
- [ ] Any `dark:` Tailwind variant or dark-mode toggle (VMS is light-only)
- [ ] A second competing "primary" hue outside `--sage` / `--indigo` / `--coral` / `--sand`

## 23. Component inventory quick-reference

`AppShell` · `TopBar` · `SidebarZoneItem` · `ZoneTree` · `ZoneCards` · `CameraCard` · `VideoTile` ·
`PlayerShell` · `StatusBadge` · `StatusDot` · `DonutCard` · `HealthScoreRing` · `ActivityListCard` ·
`MaintenanceTaskCard` · `PlatformHealthTile` · `ConnectionQualityChart` · `SimSignalIndicator` ·
`EscalationTimeline` · `TimelineScrubber` · `ClipRangeSelector` · `EvidencePhotoCard` · `SnapshotCompare` ·
`DiagnosisBanner` · `ReportExportBar` · `FilterChips` · `SearchInput` · `AvatarStack` · `ScopeBadge` ·
`IncidentKanban` · `LiveWallGrid` · `HeroHeader` · `PrimaryCTA`

Reuse these before inventing a new component. If a pattern genuinely doesn't exist yet, name it consistently
with this inventory (PascalCase, domain-first: `CameraX`, `IncidentX`, `ZoneX`).

## 24. Related skills

Use alongside: `skill-modern-hero-patterns`, `skill-modern-layout-patterns`, `skill-modern-motion-patterns`,
`skill-onboarding-flow-patterns`, `skill-report-export-patterns`, `skill-search-filter-patterns`,
`skill-table-patterns`. All seven pull from this same token set — if you change a token here, grep the
other six for the old value before you finish.
