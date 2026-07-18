# ADR-0008 — Monday Aniston Design System

**Date:** 2026-05-21
**Status:** Accepted
**Supersedes:** ADR-0002 (Glassmorphism UI with indigo-600 / Sora / DM Sans)
**Deciders:** Aniston Technologies LLP

---

## Context

ADR-0002 specified a glassmorphism visual style using indigo-600 (#4f46e5), Sora, and DM Sans fonts. Before any application code was built, the design direction changed to the **Monday Aniston design system** — a clean, professional look inspired by Monday.com with a distinctive tan shell pattern.

The new system needed to:
- Work across web, Capacitor (Android/iOS), and Electron desktop in one token set
- Be immediately recognisable as an Aniston Technologies product
- Meet WCAG 2.1 AA contrast requirements (glassmorphism had contrast issues on translucent surfaces)
- Use a warm base that reads well in long office sessions

---

## Decision

Adopt the **Monday Aniston design system** as documented in `skill-ui-ux-checklist.md`.

---

## Token Values (authoritative — never use any other values)

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| `--primary-color` | `#0073ea` | All primary CTAs, active nav, focus rings |
| `--primary-hover-color` | `#0060b9` | Hover state on primary buttons |
| `--base-tint` | `#f1ece3` | App shell background (tan warm base) |
| `--text-primary` | `#323338` | Body text |
| `--text-secondary` | `#676879` | Labels, captions |
| `--border-color` | `#e6e9ef` | Dividers, card borders |
| `--error` | `#d83a52` | Error states |
| `--success` | `#00c875` | Success states |
| `--warning` | `#ffcb00` | Warning states |

### Typography
| Role | Font | Weights |
|------|------|---------|
| Headings | **Poppins** | 500, 600, 700 |
| Body | **Figtree** | 400, 500 |
| Data / Numbers / Code | **JetBrains Mono** | 400, 500 |

Tailwind classes: `font-poppins`, `font-figtree`, `font-mono`

### Shell pattern
```
<body class="bg-[var(--base-tint)]">         // tan base
  <div class="floating-card">               // white bg, rounded-[14px] on top, stuck at top
    <div class="floating-card--stuck">      // adds shadow when scrolled
      {/* page content */}
    </div>
  </div>
</body>
```

### Border radii
| Size | Value | Use on |
|------|-------|--------|
| Small | `4px` | Inputs, badges, tags |
| Medium | `8px` | Buttons, dropdowns |
| Large | `16px` | Cards, modals, drawers |
| Shell top radius | `14px` | floating-card top-left/right only |

No other radius values. Never use `rounded-xl`, `rounded-2xl`, or arbitrary values.

### Spacing
8px grid. All spacing values are multiples of 8 (8, 16, 24, 32, 40, 48).

---

## Rationale

| Criterion | Glassmorphism (ADR-0002) | Monday Aniston |
|-----------|--------------------------|----------------|
| Contrast compliance | ❌ Translucent fails WCAG AA | ✅ Solid surfaces pass |
| Low-end Android perf | ❌ backdrop-blur GPU expensive | ✅ No blur layers |
| Design identity | ⚠️ Generic SaaS look | ✅ Distinctive warm-tan shell |
| Token simplicity | ⚠️ CSS gradient + blur combos | ✅ Single color token set |
| Electron compatibility | ⚠️ Vibrancy effects platform-specific | ✅ Pure CSS, all platforms |

The warm tan base (`#f1ece3`) was the deciding aesthetic factor — it reduces eye strain in long office sessions and creates a natural visual hierarchy with the white floating-card surfaces on top.

---

## Consequences

- `indigo-600`, `.glass-panel`, `.glass-card`, `bg-brand-600`, Sora, DM Sans are all **retired** — never use them
- All new components must use CSS custom properties (`var(--primary-color)`) not hardcoded hex values
- The full conformance checklist (24 sections) is in `skill-ui-ux-checklist.md`
- `agent-vms-uiux` enforces this system on every UI-related task

## How to apply

1. Read `skill-ui-ux-checklist.md` before building any UI component
2. Check `rule-frontend.md` for the primary color and font class names
3. Never hardcode `#0073ea` — always use `var(--primary-color)`
4. Use `agent-vms-uiux` for any layout or design work
