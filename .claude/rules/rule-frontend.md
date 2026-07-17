---
description: Frontend coding rules — RTK Query, Redux scope, component patterns, and Boilerplate Design System tokens.
---

# Frontend Coding Rules

## API calls
- ALWAYS use RTK Query hooks — never raw fetch() or axios directly
- Every query endpoint MUST have `providesTags`
- Every mutation endpoint MUST have `invalidatesTags`
- Handle loading, error, and empty states for every query

## State management
- Redux store is ONLY for auth state and global UI state
- All server data lives in RTK Query cache — never copy it into Redux slices
- Never store sensitive data (passwords, tokens, PII) in Redux or localStorage

## Components
- Function components with hooks only — no class components
- Forms: use React Hook Form with a Zod resolver
- Show a Skeleton or Loader2 spinner during any loading state
- Show a toast notification on mutation success and error

## Styling
- Tailwind CSS only — no inline styles, no CSS modules, no styled-components
- Use existing utility classes from globals.css and tailwind.config
- **Primary color:** `var(--primary-color)` = `#0073ea` | hover: `var(--primary-hover-color)` = `#0060b9`
- **Shell pattern:** tan base `var(--base-tint)` (`#f1ece3`) + `.floating-card .floating-card--stuck` (white bg, 14px top-radius)
- **Fonts:** Poppins (headings) · Figtree (body) · JetBrains Mono (data/numbers)
- **Radii:** 4px (small) / 8px (medium) / 16px (big) — no other values
- **Full spec:** `.claude/skills/skill-ui-ux-checklist.md` — all token values and component primitives

## Role-based UI
- Always check `user.role` before rendering admin-only components or actions
- Use the `hasPermission()` helper from `@boilerplate/shared/permissions`
