# Design Spec — Editing a Saved Camera Configuration

**Status:** Approved design (pre-plan). Ready to hand to the writing-plans skill.
**Date:** 2026-08-27
**Approach:** B — a focused `EditCameraModal`, with the map / RTSP / stream-spec
sections extracted from `ConfigureCameraModal` into shared field components so the
two modals cannot drift.

---

## 1. Goal & scope

Today an operator can only rename a camera (inline pencil in `CameraDetailDrawer`,
and the drawer's maintenance toggle). Everything else that the *configure* step
captured — placement (site/router/map pin), RTSP network details, and the stream
spec — is write-once. This spec adds a first-class **"Edit configuration"** flow
for an already-configured (non-DRAFT) camera.

**In scope (editable via the new modal):**

- `name`
- Placement: `siteId`, `routerId`, `latitude`, `longitude`
- Network / RTSP: `mainRtspUrl`, `subRtspUrl`, `rtspUsername`, `rtspPassword`, `onvifPort`
- Stream spec: `playbackAdapter`, `expectedCodec`, `expectedResolution`, `expectedFps`, `expectedBitrateKbps`
- Snapshot cadence: `snapshotIntervalMinutes` (CR-4, 1–60)

**Out of scope (unchanged / deliberately excluded):**

- `maintenanceMode` — stays on the drawer's existing Start/End maintenance toggle
  (`handleToggleMaintenance` → `useUpdateCameraMutation({ maintenanceMode })`). The
  modal never sends it.
- `status`, activation, deactivation, deletion — those remain their own explicit,
  test-gated / admin-gated actions. The modal never sends `status`.
- Identity metadata (`cameraCode`, `brand`, `model`, `firmware`, `serialNumber`).
  `cameraCode` is the dedupe-identity key; the rest are low-value here. Left as a
  possible follow-up (see §12). The modal edits `name` only from the identity group.
- DRAFT cameras — they keep using the existing `ConfigureCameraModal` ("Configure")
  flow, which also *activates*. The new modal is edit-only and never activates.

---

## 2. Key finding & endpoint decision (records a resolved conflict)

The earlier round of corrections asked for three things: (a) RTSP secrets should be
**write-only** — blank on open, "leave blank to keep existing", omitted from the
request unless re-entered; (b) include `snapshotIntervalMinutes`; (c) use the
state-preserving `PUT /cameras/:id/configure`. During grounding these were found to
be **mutually incompatible**, and the user chose to switch the endpoint:

| Requirement | `PUT /:id/configure` (`configureCameraSchema`) | `PATCH /:id` (`updateCameraSchema`) |
|---|---|---|
| Omit unchanged RTSP secrets | ❌ all four are required `.min(1)` (`camera.schemas.ts:83–86`); service encrypts all four unconditionally (`camera.service.ts:236–241`) | ✅ `.partial()`, every field optional (`camera.schemas.ts:103–112`); service re-encrypts + re-hashes **only provided** fields (`camera.service.ts:457–466`) |
| `snapshotIntervalMinutes` | ❌ not in schema | ✅ `.extend({ snapshotIntervalMinutes: 1–60 })` (`camera.schemas.ts:111`) |
| Never auto-activate | ✅ state-preserving | ✅ *"editing config does NOT auto-activate"* (`camera.schemas.ts:100–102`) |

**Decision (confirmed by the user): save through `PATCH /cameras/:id`** using the
existing `useUpdateCameraMutation`. It is literally the endpoint commented *"Edit an
existing camera — identity and/or config, every field optional."* No backend,
schema, migration, or RBAC change is required.

`configureCamera` / `useConfigureCameraMutation` stays owned by `ConfigureCameraModal`
(the DRAFT → configure → activate path). `updateCamera` (PATCH) keeps its existing
callers (inline rename, maintenance toggle) — the new modal is just a richer caller.

---

## 3. Hard constraints

- **No backend changes.** No new endpoints, no schema/zod edits, no Prisma migration,
  no RBAC/role changes. `updateCameraSchema` + `camera.service.updateCamera` already
  do everything needed, including partial RTSP re-encryption.
- **No drift.** The map, RTSP, and stream-spec inputs must be shared components used
  by *both* `ConfigureCameraModal` and `EditCameraModal`. Extraction must be
  behavior-preserving for the configure flow (its tests must stay green).
- **Server remains the source of truth for permissions.** UI gating is convenience;
  the PATCH route already enforces `CAMERA_WRITE_ROLES`.

---

## 4. Architecture (Approach B)

```
CamerasPage ──owns──▶ editCamera state ──▶ <EditCameraModal camera notify/>
   │  passes onEdit (write-gated) to each configured CameraCard
   ▼
CameraCard ──(configured)──▶ onEdit(camera)   ──(DRAFT)──▶ onConfigure(camera)
CameraDetailDrawer ──"Edit configuration" (canWrite)──▶ <EditCameraModal camera notify/>

Shared field components (new), consumed by BOTH modals:
  CameraPlacementFields   (site + router selects + MapLibre pin + lat/lng inputs)
  RtspCredentialFields    (main/sub URL, username, password, onvifPort) — mode: create | edit
  StreamSpecFields        (playbackAdapter, codec, resolution, fps, bitrate)

Shared form module (new): cameraConfigForm.ts
  - CameraConfigFormState type
  - configFormFromCamera(camera)  → prefill (RTSP left blank in edit mode)
  - validateConfigForm(form, mode) → field errors (manual; reuses ./coordinates)
  - buildConfigureBody(form)       → ConfigureCameraInput (all required)  [configure flow]
  - buildUpdateBody(form, camera)  → UpdateCameraInput  (omit-unchanged + blank RTSP omitted)
```

Validation stays **manual** (matching the codebase — the frontend has no client zod
schema; `ConfigureCameraModal` validates with `./coordinates` helpers + required
checks). We do not introduce zod on the client.

---

## 5. File-by-file changes

### New files

**5.1 `frontend/src/features/cameras/cameraConfigForm.ts`** (new — shared form logic)
- `PLAYBACK_ADAPTERS` and `SELECT_CLASSES` move here from `ConfigureCameraModal.tsx`
  (single source; both modals + field components import them).
- `interface CameraConfigFormState` — string-based form state (numbers held as
  strings, coerced on submit), superset covering both flows:
  `siteId, routerId, mainRtspUrl, subRtspUrl, rtspUsername, rtspPassword, onvifPort,
  playbackAdapter, expectedCodec, expectedResolution, expectedFps, expectedBitrateKbps,
  latitude(text), longitude(text), snapshotIntervalMinutes, name`.
- `configFormFromCamera(camera: Camera): CameraConfigFormState` — prefill helper.
  **RTSP fields (`mainRtspUrl/subRtspUrl/rtspUsername/rtspPassword`) are always
  initialized to `''`** because the API strips them (`sanitizeCamera`, `camera.service.ts:83–92`).
  Everything else prefills from the camera (lat/lng via `formatCoordinate`).
- `validateConfigForm(form, mode: 'create' | 'edit')` — returns a `Partial<Record<field,string>>`.
  Reuses `validateLatitude` / `validateLongitude` / `areCoordinatesValid` from `./coordinates`.
  - Non-RTSP required fields (`siteId, routerId, expectedCodec, expectedResolution,
    expectedFps, expectedBitrateKbps, latitude, longitude, name`) required in **both** modes.
  - RTSP fields: **required in `create`**, **optional in `edit`** (blank = keep). When a
    value IS present in edit mode it is still format-validated (URL fields are checked the
    same way the configure flow checks them).
  - `snapshotIntervalMinutes`: integer 1–60; soft warning (not error) below 15.
- `buildConfigureBody(form): ConfigureCameraInput` — the current `ConfigureCameraModal.buildBody`
  logic, moved verbatim (all fields required; number coercion via `Number(...)`).
- `buildUpdateBody(form, camera): UpdateCameraInput` — the **edit** builder:
  - Always include `name`, `siteId`, `routerId`, `latitude`, `longitude`,
    `playbackAdapter`, `expectedCodec`, `expectedResolution`, `expectedFps`,
    `expectedBitrateKbps`, `snapshotIntervalMinutes`, `onvifPort` (coerced).
  - **RTSP fields are added only when non-empty** (`form.mainRtspUrl.trim() !== ''`, etc.).
    An empty string must never be sent — `rtspUrlSchema` / `.min(1)` would reject it.
    Each RTSP field is independent (backend re-encrypts per-field), so a user may update
    just the URL, or just the password, etc.
  - (Optional optimization, non-blocking: could diff against `camera` to drop unchanged
    non-RTSP fields; not required for correctness since PATCH is idempotent.)

**5.2 `frontend/src/features/cameras/CameraPlacementFields.tsx`** (new)
- Extracted from `ConfigureCameraModal`: the site `<select>`, router `<select>`
  (options from `useListSitesLiteQuery` / `useListRoutersLiteQuery`), the MapLibre map
  (`maplibregl`, `DELHI_NCR`, `OSM_RASTER_STYLE` from `./mapStyle`), the pin/marker
  sync, and the lat/lng `<Input>`s with `parseCoordinate` / `formatCoordinate`.
- Presentational + self-contained map lifecycle (owns `mapRef`/`markerRef`/`useEffect`).
  Props: `{ value, errors, onChange(patch), disabled? }` over the placement subset of
  `CameraConfigFormState`. No data mutation, no endpoint calls beyond the two lite queries.

**5.3 `frontend/src/features/cameras/RtspCredentialFields.tsx`** (new)
- Extracted RTSP block: `mainRtspUrl`, `subRtspUrl`, `rtspUsername`, `rtspPassword`
  (`type="password"`), `onvifPort`.
- Prop `mode: 'create' | 'edit'`. In `edit` mode each field renders **blank** with
  placeholder/helper text **"Leave blank to keep the saved value"** and is not marked
  required; in `create` mode it behaves exactly as today (required).
- Props: `{ value, errors, mode, onChange(patch) }`. No secrets ever come from the
  camera object — the field is genuinely empty until typed.

**5.4 `frontend/src/features/cameras/StreamSpecFields.tsx`** (new)
- Extracted stream block: `playbackAdapter` `<select>` (uses shared `PLAYBACK_ADAPTERS`),
  `expectedCodec`, `expectedResolution`, `expectedFps`, `expectedBitrateKbps`.
- Props: `{ value, errors, onChange(patch) }`.

**5.5 `frontend/src/features/cameras/EditCameraModal.tsx`** (new — the feature)
- Props mirror the modal convention:
  `{ open: boolean; camera: Camera; onClose: () => void; notify: { success; error } }`.
- State: `const [form, setForm] = useState(() => configFormFromCamera(camera))`, plus a
  `useEffect` to re-seed when `camera.id` changes (so reopening on a different camera
  resets). Field-level `errors` state.
- Composition: `<AnimatedModal>` containing an editable `name` `<Input>`, then
  `<CameraPlacementFields/>`, `<RtspCredentialFields mode="edit"/>`, `<StreamSpecFields/>`,
  and a `snapshotIntervalMinutes` number field (1–60) with a sub-15-min storage warning.
- Mutations: `const [update, { isLoading }] = useUpdateCameraMutation()` and
  `const [runCheck] = useRunCameraCheckMutation()` (post-save re-probe, §9).
- **Defensive permission gate (correction #3):** read `useGetCurrentUserQuery`; if
  `!isCameraWriteRole(user?.role)` render a read-only/disabled state (or refuse to submit)
  even though the entry points already gate. Server is the final authority.
- Submit `handleSave`:
  1. `const errs = validateConfigForm(form, 'edit')`; if non-empty, set errors, abort.
  2. `const body = buildUpdateBody(form, camera)`.
  3. `await update({ id: camera.id, body }).unwrap()` → on success `notify.success(...)`,
     fire the advisory re-probe (§9), `onClose()`.
  4. On error: `notify.error(getApiErrorMessage(err as FetchBaseQueryError))`, keep open.
- No "activate", no "test connection" button in this modal (edit ≠ commission). Save is a
  single primary action.

**5.6 `frontend/src/features/cameras/EditCameraModal.test.tsx`** (new)
- Covers: prefill (non-RTSP populated, RTSP blank); save with RTSP left blank omits all
  four secret fields from the PATCH body; save with only `rtspPassword` typed includes
  just that field; validation blocks empty required non-RTSP fields; `maintenanceMode` /
  `status` are never in the body; success triggers `runCameraCheck`; permission-denied
  role cannot submit.

### Modified files

**5.7 `frontend/src/features/cameras/cameras.types.ts`** (frontend type only — not backend)
- Widen `UpdateCameraInput` from `{ name?; maintenanceMode? }` to also allow the config
  subset + `snapshotIntervalMinutes` (all optional), matching backend `updateCameraSchema`:
  `siteId?, routerId?, mainRtspUrl?, subRtspUrl?, rtspUsername?, rtspPassword?, onvifPort?,
  playbackAdapter?, expectedCodec?, expectedResolution?, expectedFps?, expectedBitrateKbps?,
  latitude?, longitude?, snapshotIntervalMinutes?`. Existing callers (rename, maintenance)
  still type-check (they pass subsets).

**5.8 `frontend/src/features/cameras/ConfigureCameraModal.tsx`** (refactor, behavior-preserving)
- Replace the inline site/router/map, RTSP, and stream blocks with `<CameraPlacementFields/>`,
  `<RtspCredentialFields mode="create"/>`, `<StreamSpecFields/>`.
- Import `PLAYBACK_ADAPTERS`, `SELECT_CLASSES`, `CameraConfigFormState`, and
  `buildConfigureBody` from `cameraConfigForm.ts` (delete the local copies).
- Keep everything else unchanged: `useTestCameraConnectionMutation` ("Test connection"),
  `useActivateCameraMutation`, `handleSaveOnly` / `handleSaveAndActivate`, the
  `activationFailureReason` handling. This modal still targets `PUT /configure`.
- `ConfigureCameraModal.test.tsx` must remain green (guard against extraction regressions).

**5.9 `frontend/src/features/cameras/CameraCard.tsx`** (add configured-camera entry point)
- Add optional prop `onEdit?: (camera: Camera) => void`.
- For a **configured** card (`!isDraft && !selectable`) render a small ghost icon-button
  (`SlidersHorizontal`, `aria-label={`Edit ${camera.name} configuration`}`) as an
  **absolutely-positioned sibling of the main `<button>`** (not nested — avoids invalid
  nested-button HTML), mirroring the existing selectable Trash2 overlay. Its `onClick`
  calls `e.stopPropagation()` then `onEdit?.(camera)` so it never triggers `onOpen`.
- Rendered only when `onEdit` is provided (parent gates by permission). DRAFT behavior
  (whole card → `onConfigure`) is unchanged.

**5.10 `frontend/src/features/cameras/CamerasPage.tsx`** (wire the entry point + modal)
- Add `const [editCamera, setEditCamera] = useState<Camera | null>(null);` (next to the
  existing `configureCamera` state ~line 93).
- On each `<CameraCard>` (~line 380) pass `onEdit={canRegister ? (cam) => setEditCamera(cam) : undefined}`
  (`canRegister = isCameraWriteRole(user?.role)`, already computed at line 84 — this is the
  entry-point permission gate).
- Render the modal near the other modals (~line 448):
  ```
  {editCamera && (
    <EditCameraModal open camera={editCamera}
      onClose={() => setEditCamera(null)}
      notify={{ success, error: notifyError }} />
  )}
  ```

**5.11 `frontend/src/features/cameras/CameraDetailDrawer.tsx`** (primary entry point)
- Add local state `const [editOpen, setEditOpen] = useState(false)` and, inside the
  existing `canWrite` header-actions region (near the rename pencil / actions block,
  ~lines 246/322), an **"Edit configuration"** button (`SlidersHorizontal` icon) that
  sets `editOpen = true`. Gated by the drawer's existing `canWrite`.
- Render `<EditCameraModal open={editOpen} camera={camera} onClose={() => setEditOpen(false)} notify={notify} />`
  once the camera has loaded (the drawer already holds the `Camera` and receives `notify`).
- The drawer only ever shows for non-DRAFT cameras, so this is always a valid edit target.
- No change to inline rename or the maintenance toggle — both stay.

---

## 6. RTSP write-only handling (correction #2, detailed)

- Source of truth: `sanitizeCamera` strips exactly the four secret/enc columns
  (`mainRtspUrlEncrypted`, `subRtspUrlEncrypted`, `rtspUsernameEncrypted`,
  `rtspPasswordEncrypted`) plus the two dedupe hashes before a `Camera` leaves the API
  (`camera.service.ts:83–92`). The frontend therefore *cannot* prefill them.
- UX: all four render blank in edit mode with **"Leave blank to keep the saved value."**
- Request shaping: `buildUpdateBody` omits any blank RTSP field entirely; an empty string
  is never sent (would fail `rtspUrlSchema` / `.min(1)`). The backend `updateCamera`
  re-encrypts + re-hashes only the fields present (`camera.service.ts:457–466`), so
  per-field partial updates are safe and unchanged secrets are preserved.

---

## 7. Permission enforcement (correction #3)

Three layers, all pointing at the same `CAMERA_WRITE_ROLES` truth the PATCH route enforces:
1. **CamerasPage / card:** `onEdit` passed only when `isCameraWriteRole(user?.role)`; no
   button renders otherwise.
2. **Drawer:** "Edit configuration" lives inside the existing `canWrite` gate.
3. **Modal (defensive):** `EditCameraModal` re-checks `isCameraWriteRole` and refuses to
   submit if false, independent of how it was opened.
4. **Server:** `cameraRouter.patch('/:id', …, validateRequest({ body: updateCameraSchema }))`
   with the route's role guard remains the final authority (unchanged).

---

## 8. `maintenanceMode` / `snapshotIntervalMinutes` (correction #4)

- `maintenanceMode` is **never** in the modal or its PATCH body; the drawer's existing
  Start/End maintenance toggle keeps sole ownership.
- `snapshotIntervalMinutes` IS in the modal (number input, 1–60) and IS in the PATCH body.
  Below 15 min shows the projected-storage-style warning described in the schema comment
  (`camera.schemas.ts:109–110`); the warning does not block saving.

---

## 9. Post-save verification (correction #5)

- After a successful PATCH, `EditCameraModal` fires an **advisory, non-blocking** re-probe:
  `runCheck(camera.id)` (`useRunCameraCheckMutation` → `POST /cameras/:id/health/run`).
- `runCameraCheck` invalidates `CameraHealth{id}`, `CameraChecks{id}`, `Camera{id}`,
  `Camera LIST` (`cameras.api.ts:158–163`), so the drawer's **Connection pipeline**
  (`useGetCameraHealthQuery`) and the card's health refresh automatically — no bespoke
  UI needed.
- **Saving succeeds regardless of the probe outcome.** The probe is fire-and-forget; if it
  errors we do not fail or reopen the save (at most an info toast). This keeps a config
  edit decoupled from live-stream reachability.
- The save itself already invalidates `Camera{id}` + `Camera LIST` + `CameraHealth{id}`
  via `useUpdateCameraMutation` (`cameras.api.ts:55–59`), so the row/drawer update even if
  the re-probe is skipped.

---

## 10. Validation rules (manual, mirrors the codebase)

- Reuse `./coordinates` (`validateLatitude`, `validateLongitude`, `areCoordinatesValid`,
  `parseCoordinate`, `formatCoordinate`) — no client zod is introduced.
- Required in edit mode: `name`, `siteId`, `routerId`, `latitude`, `longitude`,
  `expectedCodec`, `expectedResolution`, `expectedFps`, `expectedBitrateKbps`,
  `snapshotIntervalMinutes`.
- Optional in edit mode: the four RTSP fields + `onvifPort`; format-validated only when present.
- Numbers coerced with `Number(...)`; `expectedFps` 1–240, `expectedBitrateKbps`
  1–1,000,000, `onvifPort` 1–65535, `snapshotIntervalMinutes` 1–60 — matching backend bounds
  so the client rejects before the round-trip.

---

## 11. Shared-extraction risk & mitigation

- Extraction from `ConfigureCameraModal` is the main regression risk (map lifecycle,
  controlled inputs). Mitigation: field components are presentational and fully controlled
  (`value` + `onChange(patch)`); the configure flow's own state/handlers stay in
  `ConfigureCameraModal`. `ConfigureCameraModal.test.tsx` is the guard and must stay green;
  add snapshot/interaction coverage there if the extraction changes the DOM shape.

---

## 12. Testing plan

- **New** `EditCameraModal.test.tsx` — see §5.6.
- **Update** `ConfigureCameraModal.test.tsx` if selectors change due to extraction
  (behavior identical; test-connection + activate paths unchanged).
- **CamerasPage / CameraCard** — a test that a configured card exposes Edit only for a
  write-role user and that clicking it opens the modal without navigating.
- No backend tests change (no backend change). `camera.schemas.test.ts` /
  `camera.service.*.test.ts` already cover partial PATCH + partial RTSP.

---

## 13. Out of scope / follow-ups

- Editing identity metadata (`brand`, `model`, `firmware`, `serialNumber`) and `cameraCode`.
- A dedicated "change stream credentials" sub-flow (current design treats each RTSP field as
  independently optional, which is sufficient).
- Diff-based minimization of the PATCH body (idempotent today; optional optimization).

---

## 14. Open questions / risks

1. **Name lives in two places** — inline rename (drawer) and this modal both PATCH `name`.
   Acceptable (both idempotent); flag if a single edit surface is preferred.
2. **Independent RTSP fields** — updating only `mainRtspUrl` keeps the stored username/
   password. If product wants "URL change forces credential re-entry", add a cross-field
   rule in `validateConfigForm('edit')`. Not assumed here.
3. **Card affordance density** — the small edit icon on configured cards adds one control;
   if undesired, the drawer entry point alone can carry the feature (drop §5.9/§5.10 card wiring).
4. **Router↔site integrity on PATCH** — self-review of `camera.service.updateCamera`
   (`camera.service.ts:418–434`) shows that sending `siteId`/`routerId` triggers
   `assertRouterBelongsToSite` + a site-access-scope check server-side every save. Since
   `buildUpdateBody` always includes both, `CameraPlacementFields` should keep the router
   `<select>` consistent with the chosen site (or surface the resulting 4xx cleanly). This
   matches existing `ConfigureCameraModal` behavior (routers are listed unfiltered today),
   so it is a pre-existing UX edge, not a regression — flagged for the plan.
