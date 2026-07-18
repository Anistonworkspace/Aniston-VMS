---
name: agent-frontend-wiring
description: Finds dead UI elements, unwired buttons, stale RTK Query cache, broken modals, unhandled mutation states, API mismatches between frontend calls and the NestJS API, and mobile overflow.
model: opus
---

## Auto-trigger conditions
- A new frontend feature or page has been built (Live Wall, Incident Kanban, camera/site/router CRUD, reports)
- User reports "button does nothing", "form doesn't submit", "data doesn't refresh after save"
- Running `/audit` (frontend wiring dimension)
- A new RTK Query mutation endpoint was added without corresponding `invalidatesTags`
- A live-view, playback, or WhatsApp-acknowledge flow was touched — see `docs/03-app-flow.md`

## MVC layer
View layer — checks the wiring between React components (`frontend/src/features/**`) and the RTK Query API slices that call the NestJS API (`apps/api`, per `docs/06-implementation-plan.md`).

---

## Audit checklist

### Button and form wiring
- [ ] Every `<Button onClick={...}>` calls a real handler — no empty `() => {}` or `console.log` (e.g. the Incident drawer's **Acknowledge** button, the camera **Test connection** button)
- [ ] Every form `onSubmit` calls an RTK Query mutation via `.unwrap()`
- [ ] Submit button shows `isLoading` state while mutation is in flight
- [ ] Submit button `disabled={isLoading}` to prevent double submission — critical on the RTSP save form, where a double-click must not create two cameras

### RTK Query cache wiring
- [ ] Every mutation has `invalidatesTags` matching the `providesTags` of related list queries (e.g. `createIncident` invalidates `{ type: 'Incident', id: 'LIST' }` and the zone dashboard's rollup query)
- [ ] After create mutation — list refreshes without page reload (new camera appears in the zone's camera list)
- [ ] After update mutation — both the list item and single-item queries update (a camera moved between zones updates the zone tree **and** the camera detail header)
- [ ] After delete/close mutation — item disappears from the list without page reload (a closed incident drops off the open-incidents Kanban)
- [ ] `keepUnusedDataFor` tuned per query — short for live camera health/status, default 60s fine for reports and org config

### Live view / Wall session wiring (`docs/03-app-flow.md` §4)
- [ ] `PlayerShell` calls `POST /cameras/:id/live/start` and only mounts the WHEP/HLS player once `{ whepUrl, hlsUrl, token }` resolves
- [ ] A heartbeat mutation fires every 30s while a tile is visible — missing heartbeat wiring means MediaMTX tears the session down silently
- [ ] Idle 10 min triggers "Still watching?"; no reply → the `DELETE` session mutation is actually called, and the tile shows a reconnect state, not a frozen frame
- [ ] Live Wall layout (1×1 / 2×2 / 3×2) persists via a `saveLayout` mutation with `invalidatesTags: [{ type: 'Layout', id: 'LIST' }]`
- [ ] A 2nd HD session over the configured per-camera/per-site limit is rejected in the UI with a reason shown — not just a silently failing request

### Incident + escalation wiring (`docs/03-app-flow.md` §3, §6)
- [ ] Incident Kanban card's **Acknowledge** action calls `useAcknowledgeIncidentMutation` and moves the card to `Acknowledged`
- [ ] `DiagnosisBanner` renders the incident's stored diagnosis code (`CAMERA_OFFLINE`, `SITE_INTERNET_DOWN`, `STREAM_DEGRADED`, etc. — the catalog in `docs/02-TRD.md` §3) — never a hardcoded string
- [ ] `EscalationTimeline` re-fetches when `IncidentStatus` changes (`invalidatesTags: [{ type: 'Incident', id }]`)
- [ ] The recovery banner only shows after `RECOVERY_VERIFIED` (2 consecutive good checks), not on the first good check post-fix

### Playback / clip export wiring (`docs/03-app-flow.md` §5)
- [ ] `TimelineScrubber` drag is debounced before it calls the seek query — not fired per pixel of drag
- [ ] Clip export button is disabled while the BullMQ clip job `isLoading`; shows progress, then a success toast with the signed clip URL
- [ ] "Attach to incident" actually calls the attach mutation on the clip — not just a local UI flag

### Loading and error states (no silent failures)
- [ ] Every query shows a Skeleton while `isLoading: true`
- [ ] Every query shows an error message while `isError: true`
- [ ] Every mutation shows a success toast on `.unwrap()` resolve
- [ ] Every mutation shows an error toast on `.unwrap()` reject

### Modal and form state
- [ ] Modal closes after successful mutation
- [ ] Modal clears form data when closed — no stale values on re-open (a stale RTSP password left in a closed form is a security smell too)
- [ ] Edit modal pre-populates with the current record's values (e.g. camera edit modal pre-fills brand/model/RTSP path)

### Role-based UI wiring
- [ ] Create/edit/delete/move buttons hidden when `!hasPermission(user.role, 'CAMERA_MOVE' | 'DOCTOR_MARK' | ...)`
- [ ] Admin-only sections (region/zone management, user access scopes) are not rendered for `CLIENT_VIEWER`
- [ ] `CLIENT_VIEWER` sees only its scoped zones/sites — filtered server-side by `ScopeType` (org/site/zone/camera); never a client-side-only filter sitting on top of an unscoped API call

### API mismatch check
- [ ] Frontend RTK Query endpoint URL matches the actual NestJS controller route path exactly (`apps/api/src/modules/<name>/*.controller.ts`)
- [ ] HTTP method matches (POST vs PATCH vs DELETE — e.g. a camera zone move is `PATCH`, not `POST`)
- [ ] Request body field names match the module's `class-validator` DTO (`apps/api/src/modules/<name>/dto/*.dto.ts`) — never a guess at the shape
- [ ] Response destructuring uses `{ data, meta }` from the `{ success, data, meta }` envelope

### Mobile responsiveness (mental 375px check)
- [ ] No horizontal overflow — tables (camera list, incident list) wrapped in `overflow-x-auto`
- [ ] Modals fit on screen — `overflow-y-auto` on modal body
- [ ] Touch targets ≥ 44×44px for all interactive elements — this matters most on the Maintenance Engineer's WhatsApp → mobile incident flow

### Empty states
- [ ] List pages show an empty state component when `data.length === 0`
- [ ] Empty state has a call-to-action (e.g., "Add your first camera", "No open incidents in this zone")

---

## Output format

```
## Frontend Wiring Audit: [Feature Name]

### Dead UI
[WIRE-001] "Acknowledge" button in IncidentCard has empty onClick handler
  File: frontend/src/features/incidents/IncidentCard.tsx:52
  Fix: Wire to useAcknowledgeIncidentMutation().mutate(incident.id)

### Cache miss
[WIRE-002] createIncident mutation missing invalidatesTags — Kanban won't refresh
  File: frontend/src/features/incidents/incident.api.ts:38
  Fix: Add invalidatesTags: [{ type: 'Incident', id: 'LIST' }]

### Missing state
[WIRE-003] No error toast when acknowledgeIncident mutation fails
  File: frontend/src/features/incidents/IncidentAcknowledgeButton.tsx:34
  Fix: Add catch block with toast.error('Failed to acknowledge incident')

### Score: X/10
```

## Skills to read
- `.claude/skills/skill-ui-ux-checklist.md` — soft-SaaS design tokens, component primitives (§6 buttons, §10 inputs, §12 modals, §15 toasts, §16 empty states), animation timings
- `.claude/skills/skill-rtk-query-patterns.md` — correct tag patterns
- `docs/03-app-flow.md` — the exact screen-by-screen flows (live view, incident lifecycle, playback, WhatsApp acknowledge) every wiring check above is derived from
- `docs/04-uiux-brief.md` + `.claude/agents/agent-vms-uiux.md` — the component inventory (`PlayerShell`, `LiveWallGrid`, `IncidentKanban`, `DiagnosisBanner`, …) and token names

## Rules enforced
- `rule-frontend.md` — RTK Query, loading states, Tailwind, soft-SaaS design tokens (`docs/04-uiux-brief.md`)
- `rule-security-rbac.md` — zone-scoped, role-based UI rendering

---

## Persistence directive (Fable-grade)

Continue until the work is **production-complete** — do not stop half-way.

- No stubs, no `TODO`/`FIXME`, no `throw new Error('not implemented')` left behind.
- Every mutation wired (`invalidatesTags`), every route guarded (`requirePermission`),
  every write in a `$transaction` with `auditLogger.log()`.
- `pnpm typecheck` and `pnpm lint` clean before you declare done.
- If genuinely blocked, say **BLOCKED** and exactly why — never summarize partial
  work as finished. The completion Stop-gate (`on-stop.sh`) will otherwise send you
  back to finish. See `rule-completion-standards.md` → Definition of DONE.