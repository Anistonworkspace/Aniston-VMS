# Design Spec — Safely Removing an Added Camera

**Status:** Approved design (pre-plan). Ready to hand to the writing-plans skill.
**Scope:** Cameras page delete UX + hardening the existing `DELETE /cameras/:id` endpoint.
**Decision (confirmed with product):** *Harden the existing hard-delete.* No soft-delete, no DB migration.

---

## 1. Goal & Chosen Approach

Let an admin safely remove a camera from the Cameras page. Reuse the **existing**
`DELETE /cameras/:id` endpoint and make it production-safe, rather than adding a
soft-delete/decommission state (rejected as over-engineered for this task — YAGNI, and it
would require a Prisma migration + list-filter + state-machine changes).

**Net behaviour after this change:**
- A camera with **no retained history** (e.g. a just-added camera) is removed cleanly.
- A camera that has **any** retained history (recordings, snapshots, health records,
  reference images, or recorded incidents) **cannot** be removed and returns a clear **409**
  instead of an unhandled 500. All history is preserved *by refusing* to delete.

**End-to-end user flow:**
`Refresh → Add camera → Delete camera → Select camera → Confirmation popup → Delete or Cancel`

---

## 2. Requirements Traceability

| # | Requirement | Where satisfied |
|---|-------------|-----------------|
| 1 | Reposition action buttons; three in order **Refresh → Add camera → Delete camera** | §4.2 action bar |
| 2 | Keep Refresh & Add camera exactly as-is (incl. `isCameraWriteRole` gate) | §4.2 |
| 3 | Don't change unrelated card design outside the action area | §4.3 (overlay-only indicator) |
| 4 | Selection mode: per-card indicator + instruction "Select a camera to delete." + Cancel | §4.2 / §4.3 |
| 5 | Confirmation popup with camera details + preservation note; Delete or Cancel | §4.4 |
| 6 | Reuse existing endpoint; make production-safe; preserve incidents/audit/recordings | §3 |
| 7 | On failure show the real error; do **not** remove the camera from the UI | §4.5 error matrix |
| 8 | RBAC: Delete is admin-only, server-enforced | §3, §4.2, §5 |

---

## 3. Backend — Harden `deleteCamera`

**File:** `backend/src/modules/cameras/camera.service.ts` (function at line 302).
**Router/RBAC:** unchanged — `DELETE /cameras/:id` already gated
`requireRole('SUPER_ADMIN','PROJECT_ADMIN')` (ADMIN_ROLES — *not* ENGINEER), returns
`{ success: true, data: null }`. **No migration. No schema change.**

### 3.1 The bug being fixed
Current `deleteCamera` guards `incidentCount` and `referenceImageCount` (clean 409) but then
calls `prisma.camera.delete()` directly. The other `RESTRICT` foreign keys
(`health_checks`, `snapshots`, `connection_quality_hourly`, `sd_card_status`,
`recording_segments`, `maintenance_tasks`, `stream_sessions`, `clip_exports`) are **unguarded**,
so a camera that ever ran a health check throws Prisma **P2003**. The global `errorHandler`
maps only **P2002/P2025**, so P2003 escapes as an **unhandled 500 leaking a Prisma message**.

### 3.2 Fixes (three, all in one function)
1. **Atomic delete + audit in one transaction** (refinement #5). Today deletion uses the
   best-effort `audit(req, …)` helper, which *catches and swallows* audit failures — so a
   camera could be deleted with **no** audit record. Wrap the delete **and** the audit in
   `prisma.$transaction`, using the existing `auditWithinTx(tx, …)` helper
   (`backend/src/lib/audit.ts:37`) so the row commits atomically with the delete
   (all-or-nothing).
2. **Map P2003 → clean 409** via a `try/catch` around the transaction. A single delete is
   atomic and the transaction rolls back on any throw, so nothing is partially deleted.
3. **Keep** the existing incident and reference-image guards (they give specific messages and,
   for incidents which are `SET NULL`, deliberately refuse rather than orphan history).

### 3.3 Import change (required for the P2003 `instanceof`)
`camera.service.ts:3` currently imports `Prisma` **type-only**:
`import type { Camera, Prisma } from '@prisma/client';`
The `instanceof Prisma.PrismaClientKnownRequestError` check needs `Prisma` as a **runtime
value**. Change to:
```ts
import { Prisma } from '@prisma/client';
import type { Camera } from '@prisma/client';
```
And extend the audit import (keep `audit` — still used by other mutations in the file):
```ts
import { audit, auditWithinTx } from '../../lib/audit.js';
```
> Mirror however `middleware/errorHandler.ts` already references Prisma error codes (P2002/P2025) so the pattern is consistent.

### 3.4 Target implementation
```ts
export async function deleteCamera(id: string, actor: AuthUser, req: Request) {
  const before = await findCameraOrThrow(id, actor); // 404 out-of-scope-missing / 403 forbidden
  const [incidentCount, referenceImageCount] = await Promise.all([
    prisma.incident.count({ where: { cameraId: id } }),
    prisma.referenceImage.count({ where: { cameraId: id } }),
  ]);
  if (incidentCount > 0)
    throw new ConflictError('Cannot delete a camera that still has recorded incidents');
  if (referenceImageCount > 0) {
    throw new ConflictError('Cannot delete a camera that still has approved reference images');
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.camera.delete({ where: { id } });
      await auditWithinTx(tx, {
        userId: actor.id,
        action: 'camera.delete',
        entityType: 'Camera',            // keep capitalized — matches existing audit rows
        entityId: id,
        siteId: before.siteId,           // Camera has a direct site_id column; enables site-scoped audit filtering. Camera has NO zoneId column (zone lives above site), so zoneId is omitted (defaults null).
        oldValue: sanitizeCamera(before), // strips all 6 encrypted/hash fields — NO creds
        ipAddress: req.ip ?? null,        // preserve ip capture that audit(req,…) provided
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw new ConflictError(
        "This camera can't be removed because it still has recorded history " +
        '(recordings, snapshots, or health records). Its history is retained.',
      );
    }
    throw err; // unknown errors bubble to the global errorHandler unchanged
  }
}
```

### 3.5 Security / secrets (unchanged guarantees)
- `sanitizeCamera(before)` (line 73) strips `mainRtspUrlEncrypted`, `subRtspUrlEncrypted`,
  `rtspUsernameEncrypted`, `rtspPasswordEncrypted`, `mainRtspHash`, `subRtspHash` — the audit
  `oldValue` carries **no credentials** (rule-secrets-policy).
- Scope/IDOR enforced by `findCameraOrThrow` before any count or delete (rule-security-rbac).

---

## 4. Frontend

### 4.1 RTK Query mutation — `frontend/src/features/cameras/cameras.api.ts`
Follows `skill-rtk-query-patterns.md` (per-id + LIST tag invalidation):
```ts
deleteCamera: builder.mutation<void, string>({
  query: (id) => ({ url: `/cameras/${id}`, method: 'DELETE' }),
  invalidatesTags: (_result, _error, id) => [
    { type: 'Camera', id },
    { type: 'Camera', id: 'LIST' },
  ],
}),
```
Export `useDeleteCameraMutation`. RTK Query invalidates **only on `fulfilled`**, so a failed
delete leaves the cached list untouched (satisfies req 7). The `{success,data:null}` body is
ignored (`void`).

### 4.2 Action bar + selection mode — `CamerasPage.tsx` (action group at lines 167–181)
New state/derived values:
```ts
const canDelete = isAdminRole(user?.role);   // ADMIN_ROLES = SUPER_ADMIN | PROJECT_ADMIN (verified)
const [selecting, setSelecting] = useState(false);
const [prevView, setPrevView] = useState<'grid' | 'map' | null>(null);
const [pendingDelete, setPendingDelete] = useState<Camera | null>(null);
const [errorMessage, setErrorMessage] = useState<string | null>(null);
```

**Buttons (order fixed): Refresh → Add camera → Delete camera.**
- Refresh & Add camera: **unchanged** behaviour and gating (`canRegister = isCameraWriteRole`).
- The action group keeps its right alignment in the `justify-between` header and naturally
  extends leftward to make room for the third button ("reposition slightly toward the left").
- **Delete camera** button: rendered only when `canDelete`. **Danger-outline via `className`
  override** on the existing `Button` (refinement #1 — no new global variant). Compose an
  `variant="outline"` button tinted with the same red the `danger` variant uses (reuse the
  `critical`/coral token — read `Button.tsx` cva to copy the exact token), ensuring:
  - **hover:** subtle red fill / stronger red border,
  - **focus-visible:** red focus ring,
  - **disabled:** reduced opacity + no hover change.
  Icon: `Trash2` (lucide-react).

**Entering selection mode** (click "Delete camera"):
```ts
function enterSelection() {
  if (view === 'map') { setPrevView('map'); setView('grid'); } // selection is grid-only (cards)
  setSelecting(true);
}
```
While `selecting`:
- The **Delete camera** button is replaced by a **Cancel** button (secondary).
- A thin instruction banner renders above the grid: **"Select a camera to delete."**

**Exiting selection mode** (Cancel *or* after a successful delete) — restore the remembered
view (refinement #3):
```ts
function exitSelection() {
  setSelecting(false);
  setPendingDelete(null);
  setErrorMessage(null);
  if (prevView) { setView(prevView); setPrevView(null); } // restore Map if we forced Grid
}
```

### 4.3 Card selection indicator — `CameraCard.tsx`
`CameraCard` is a `<button>` that navigates on click. Extend props:
```ts
selectable?: boolean;
onSelect?: (camera: Camera) => void;
```
- When `selectable`, the card's click calls `onSelect(camera)` (opens the confirm popup)
  **instead of** navigating; add `aria-pressed`/`aria-label` for a11y.
- Render an **absolutely-positioned** selection indicator (checkbox-style circle, top-right)
  plus a subtle ring — an **overlay** so the default card layout/spacing is **unchanged** when
  not selecting (satisfies req 3; the checkbox is the sanctioned change for req 4).
- Follows `skill-ui-ux-checklist.md`: ≥44px touch target for the card, visible focus ring,
  works in grid at all breakpoints.

### 4.4 Confirmation popup — new `DeleteCameraModal.tsx` (presentational)
Built on `AnimatedModal` (mirrors `ConfirmDialog`). **Pure/props-driven** for easy unit testing:
```ts
interface DeleteCameraModalProps {
  open: boolean;
  camera: Camera | null;
  loading: boolean;
  errorMessage: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}
```
Contents:
- `AlertTriangle` icon; title **"Remove camera?"**
- Camera **name**, **cameraCode**, and **site name** (and zone if present on the camera object).
- Question: "Are you sure you want to remove this camera?"
- **Preservation note (approved wording, refinement #7):**
  > Removing a camera never deletes historical incidents, recordings, snapshots, or health
  > records. If the camera has any retained history, it cannot be removed.
- Buttons: **Cancel** (secondary) + **Delete camera** (danger/red). While `loading`: label
  "Deleting…", **both buttons disabled** (prevents repeat clicks / double-submit).
- When `errorMessage` is set: render it inline (red) and keep the modal **open**.

### 4.5 Deletion flow + error handling — `CamerasPage.tsx`
The page owns the mutation, toast, selection state and view restore. The confirm handler uses
the **caught error directly** (refinement #6) so the modal shows the message immediately,
rather than waiting for the hook's async `error` state to re-render:
```ts
const [del, { isLoading: isDeleting }] = useDeleteCameraMutation();

async function confirmDelete() {
  if (!pendingDelete) return;
  setErrorMessage(null);
  try {
    await del(pendingDelete.id).unwrap();
    success('Camera removed');   // useToast
    exitSelection();             // closes modal, exits selection, restores previous view
  } catch (err) {
    setErrorMessage(getApiErrorMessage(err)); // immediate, from the caught error
    // pendingDelete stays set → modal stays open, camera stays in the list
  }
}
```

**Error matrix (req 7 — camera never disappears on failure):**

| Case | Server | UX |
|------|--------|----|
| Success | 200 `{data:null}` | toast "Camera removed", modal closes, list refetches via tags, view restored |
| Has history | 409 (P2003→ConflictError) | inline error in modal, camera stays |
| Has incidents / reference images | 409 | inline error in modal, camera stays |
| Not admin | 403 | inline error; button shouldn't show for non-admins anyway (server still enforces) |
| Already deleted elsewhere | 404 | inline error; list refetch reconciles on next load |
| Network/5xx | — | `getApiErrorMessage(err)` fallback message, camera stays |

---

## 5. RBAC / Compliance mapping

- **rule-security-rbac / agent-api-security:** Delete gated `isAdminRole` on the client
  (mirrors backend ADMIN_ROLES) **and** `requireRole('SUPER_ADMIN','PROJECT_ADMIN')` +
  `findCameraOrThrow` scope on the server (defense in depth; IDOR-safe). No RBAC rule changed.
- **rule-secrets-policy:** audit `oldValue` uses `sanitizeCamera` → no RTSP creds/hashes.
- **rule-audit-standards / rule-database (data integrity):** delete + audit are one
  `prisma.$transaction` (atomic); no orphaned audit gaps.
- **rule-database-migrations:** none required (reusing existing schema).
- **rule-state-machines:** camera status state machine untouched (hard delete, not a state).
- **rule-frontend / agent-frontend-wiring:** mutation is wired to a real button, invalidation
  refreshes the list, no dead buttons, loading/disabled states handled.
- **agent-vms-uiux / skill-ui-ux-checklist:** overlay-only card change, focus rings, touch
  targets, danger-outline states (hover/focus/disabled) all specified.

---

## 6. Tests

### 6.1 Backend — Jest, service-level, mock Prisma
`backend/src/modules/cameras/camera.service.delete.test.ts` (mirrors
`hierarchy.service.test.ts` / `clip.service.test.ts`):
- Out-of-scope/missing → rejects (403/404 via `findCameraOrThrow`).
- 409 when `incidentCount > 0`.
- 409 when `referenceImageCount > 0`.
- **P2003 from `tx.camera.delete` → ConflictError (409), NOT 500** — the core hardening.
- Success path → `camera.delete` called **and** `auditLog.create` called **inside the same
  transaction**; audit `oldValue` contains **none** of the 6 encrypted/hash fields.
- Transaction atomicity: when `auditWithinTx` throws, the transaction rejects (delete not
  committed) — assert the delete does not "succeed" without its audit.

### 6.2 Frontend — Vitest (mock the api + auth hooks; existing module-mock style)
`DeleteCameraModal.test.tsx` (pure component):
- Renders name/code/site, warning, and the approved preservation note.
- Cancel → `onCancel`; Delete → `onConfirm`.
- `loading` → label "Deleting…", both buttons disabled.
- `errorMessage` renders and the modal stays open.

`CamerasPage.delete.test.tsx`:
- Button **order** Refresh → Add camera → Delete camera.
- Delete **hidden** for non-admin (ENGINEER/OPERATOR/CLIENT_VIEWER); **shown** for admin.
- Entering selection → instruction banner + Cancel + selectable cards; a card click opens the
  modal (does **not** navigate).
- Cancel exits selection and **restores the previous view** (Map→Grid→Map).
- Confirm → mutation called; on success modal closes, selection exits, success toast, view
  restored.
- Failure → modal stays open, error shown, **camera still present** in the list.

Coverage stays within existing thresholds (FE 70/70/60/70).

---

## 7. Verification (no commit / no push)
- Backend: `npm --prefix backend run test -- camera.service.delete` + `tsc` typecheck.
- Frontend: `npm --prefix frontend run test -- DeleteCameraModal CamerasPage.delete` + `tsc`
  typecheck; attempt build if the working tree is clean enough. Report all results honestly.

---

## 8. Files touched
**Backend:** `modules/cameras/camera.service.ts` (harden `deleteCamera` + imports); new
`modules/cameras/camera.service.delete.test.ts`.
**Frontend:** `features/cameras/cameras.api.ts` (mutation), `CamerasPage.tsx` (action bar +
selection + flow + view restore), `CameraCard.tsx` (selectable overlay), new
`features/cameras/DeleteCameraModal.tsx`, new `DeleteCameraModal.test.tsx` +
`CamerasPage.delete.test.tsx`.

## 9. Non-goals / out of scope
- No soft-delete/decommission state, no bulk delete, no map-view selection, no changes to the
  camera status state machine, no schema migration, no RBAC rule changes.

## 10. Open questions
None outstanding — removal semantics, button styling, view-restore, transaction, error
display, and preservation wording are all resolved.
