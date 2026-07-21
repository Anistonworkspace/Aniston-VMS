# Implementation Plan — Safely Removing an Added Camera

**Design source:** `docs/superpowers/specs/safe-camera-removal.md` (approved).
**Decision:** Harden the **existing** `DELETE /cameras/:id` hard-delete. No soft-delete, no schema migration, no RBAC rule changes.

---

## 0. Bottom line up front

You will make a camera on the Cameras page safely removable:

1. **Backend:** wrap the existing `deleteCamera` delete + audit in one `prisma.$transaction`, and map Prisma foreign-key error **P2003** to a clean **409** instead of an unhandled 500.
2. **Frontend:** add a `deleteCamera` RTK Query mutation; add a **Delete camera** button + selection mode to the Cameras page; add a `DeleteCameraModal` confirmation popup; make `CameraCard` selectable.
3. **Tests:** one backend Vitest file, two frontend Vitest files.

**Button order (fixed):** `Refresh → Add camera → Delete camera`.
**Non-negotiable UX rule:** on any delete failure the camera **stays in the list** and the real error shows inline in the modal.

**Ground rules for the whole task:**
- Do **not** `git commit` or `git push`. Leave the tree dirty for review.
- This repo is Windows + PowerShell; the Bash tool is available for POSIX. Commands below are given as `npm --prefix ...` which run in either shell.
- Match existing style exactly (import ordering, `.js` extensions on backend relative imports, single quotes, 2-space indent).

---

## 1. Orientation — files you will touch

| File | Change |
|------|--------|
| `backend/src/modules/cameras/camera.service.ts` | Harden `deleteCamera` (imports + function body) |
| `backend/src/modules/cameras/camera.service.delete.test.ts` | **New** — backend unit tests (Vitest, mock Prisma) |
| `frontend/src/features/cameras/cameras.api.ts` | Add `deleteCamera` mutation + export hook |
| `frontend/src/features/cameras/DeleteCameraModal.tsx` | **New** — confirmation popup (pure/presentational) |
| `frontend/src/features/cameras/CameraCard.tsx` | Add `selectable`/`onSelect` overlay |
| `frontend/src/features/cameras/CamerasPage.tsx` | Action bar + selection mode + delete flow + view restore |
| `frontend/src/features/cameras/DeleteCameraModal.test.tsx` | **New** — component test |
| `frontend/src/features/cameras/CamerasPage.delete.test.tsx` | **New** — page behavior test |

**Files that DO NOT change (verified):**
- `backend/src/modules/cameras/camera.router.ts` — `DELETE /:id` is already gated `requireRole(...ADMIN_ROLES)`, calls `cameraService.deleteCamera(params.id, authUser(req), req)`, and returns `{ success: true, data: null }`. No edit.
- `backend/src/middleware/errorHandler.ts` — `ConflictError extends AppError` → HTTP **409** (`errorHandler.ts:42-44`). Because we convert P2003 to a `ConflictError` in the service, the handler needs no change.
- Prisma schema / migrations — none.

---

## 2. Verified current-state facts (anchors the edits rely on)

- `camera.service.ts:3` — `import type { Camera, Prisma } from '@prisma/client';` (Prisma is **type-only** today).
- `camera.service.ts:5` — `import { audit } from '../../lib/audit.js';`
- `camera.service.ts:6-11` — `ConflictError` is already imported from `../../middleware/errorHandler.js`.
- `camera.service.ts:73` — `sanitizeCamera(camera)` strips the 6 secret fields (`mainRtspUrlEncrypted`, `subRtspUrlEncrypted`, `rtspUsernameEncrypted`, `rtspPasswordEncrypted`, `mainRtspHash`, `subRtspHash`).
- `camera.service.ts:119` — `findCameraOrThrow` → `prisma.camera.findUnique` (404) + `getUserScope` + `canAccessCamera` (403).
- `camera.service.ts:302-320` — current `deleteCamera` (target of the edit).
- `backend/src/lib/audit.ts:37` — `auditWithinTx(tx, p)` writes `tx.auditLog.create({ data: toData(p) })`. `AuditParams` accepts `userId, action, entityType, entityId, siteId?, zoneId?, oldValue?, ipAddress?`. `toData` defaults `ipAddress` to `'0.0.0.0'` when null.
- `backend/src/lib/scope.ts` — `canAccessCamera(scope, id)` returns `true` immediately when `scope.all` (so an `ALL`-scope test caller needs no extra prisma mock beyond `camera.findUnique`).
- `frontend/src/features/auth/auth.types.ts:64` — `isAdminRole(role)` = `SUPER_ADMIN | PROJECT_ADMIN`. `isCameraWriteRole` at `:76`.
- `frontend/src/components/ui/index.ts` — barrel exports `Button` and `AnimatedModal`.
- `frontend/src/components/ui/Button.tsx` — `variants` has `danger` (`bg-coral … ring-coral`) and `outline` (`border-sage text-sage hover:bg-sage-soft ring-sage`); `variant`/`size`/`loading`/`leftIcon` props; `cn()` (tailwind-merge) makes a trailing `className` win.
- `CamerasPage.tsx:56` — `const { toasts, dismiss, success, error: notifyError } = useToast();`
- `CamerasPage.tsx:72-76` — `view`/`addOpen` state, `user`, `canRegister`.
- Frontend tests: **Vitest** + `@testing-library/react`; `environment: 'jsdom'`, `setupFiles: ['./src/test/setup.ts']`; coverage thresholds **lines 70 / functions 70 / branches 60 / statements 70**.
- Backend tests: **Vitest** with module-mocked Prisma (`vi.mock('../../lib/prisma.js', …)`) + `await import('./x.service.js')` — see `backend/src/modules/hierarchy/hierarchy.service.test.ts`. (The spec said "Jest"; the codebase is Vitest — follow the codebase.)

---

## TASK 1 — Backend: harden `deleteCamera`

**File:** `backend/src/modules/cameras/camera.service.ts`

### 1a. Make `Prisma` a runtime value + import `auditWithinTx`

`instanceof Prisma.PrismaClientKnownRequestError` needs `Prisma` as a value, not a type.

Replace line 3:
```ts
import type { Camera, Prisma } from '@prisma/client';
```
with:
```ts
import { Prisma } from '@prisma/client';
import type { Camera } from '@prisma/client';
```

Replace line 5:
```ts
import { audit } from '../../lib/audit.js';
```
with (keep `audit` — still used by other mutations in this file):
```ts
import { audit, auditWithinTx } from '../../lib/audit.js';
```

### 1b. Replace the `deleteCamera` body (currently lines 302-320)

Replace exactly:
```ts
export async function deleteCamera(id: string, actor: AuthUser, req: Request) {
  const before = await findCameraOrThrow(id, actor);
  const [incidentCount, referenceImageCount] = await Promise.all([
    prisma.incident.count({ where: { cameraId: id } }),
    prisma.referenceImage.count({ where: { cameraId: id } }),
  ]);
  if (incidentCount > 0)
    throw new ConflictError('Cannot delete a camera that still has recorded incidents');
  if (referenceImageCount > 0) {
    throw new ConflictError('Cannot delete a camera that still has approved reference images');
  }
  await prisma.camera.delete({ where: { id } });
  await audit(req, {
    userId: actor.id,
    action: 'camera.delete',
    entityType: 'Camera',
    entityId: id,
    oldValue: sanitizeCamera(before),
  });
}
```
with:
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

  // Delete + audit as one atomic unit: auditWithinTx writes inside the same
  // transaction, so we never lose the audit trail for a delete (the old
  // best-effort audit(req, …) swallowed failures). Throwing anywhere inside the
  // callback rolls the whole transaction back, so nothing is left half-removed.
  await prisma.$transaction(async (tx) => {
    // Scope the P2003 → 409 conversion to the delete itself. A foreign-key
    // violation HERE means the camera still has retained history. An audit-side
    // DB failure must NOT be caught here, or it would be mislabeled as
    // "retained history"; it propagates instead (→ 500 via the global handler),
    // which is the correct signal for a genuine server-side audit failure.
    try {
      await tx.camera.delete({ where: { id } });
    } catch (err) {
      // The remaining RESTRICT foreign keys (health_checks, snapshots,
      // connection_quality_hourly, sd_card_status, recording_segments,
      // maintenance_tasks, stream_sessions, clip_exports) throw Prisma P2003.
      // The global errorHandler only maps P2002/P2025, so without this a camera
      // with history would 500 and leak a Prisma message. Convert to a clean 409.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ConflictError(
          "This camera can't be removed because it still has recorded history " +
            '(recordings, snapshots, or health records). Its history is retained.'
        );
      }
      throw err; // unknown delete errors bubble to the global errorHandler unchanged
    }

    await auditWithinTx(tx, {
      userId: actor.id,
      action: 'camera.delete',
      entityType: 'Camera',
      entityId: id,
      siteId: before.siteId, // Camera has a direct site_id column; enables site-scoped audit filtering. No zoneId column (zone lives above site), so it defaults null.
      oldValue: sanitizeCamera(before), // strips all 6 encrypted/hash fields — no creds in the audit row
      ipAddress: req.ip ?? null,
    });
  });
}
```

### Task 1 verification
```
npm --prefix backend run typecheck
```
(or `npx --prefix backend tsc --noEmit` if there is no `typecheck` script). Expect no new type errors. `Prisma` must resolve as a value; `before.siteId` must type-check (Camera has `siteId`).

---

## TASK 2 — Backend: unit tests for `deleteCamera`

**New file:** `backend/src/modules/cameras/camera.service.delete.test.ts`

Mirrors `hierarchy.service.test.ts` (Vitest, mock Prisma, dynamic import). `$transaction` runs its callback with the same mock object as `tx`, so `tx.camera.delete` / `tx.auditLog.create` are the same spies.

```ts
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

// Minimal Prisma stub — only the calls deleteCamera touches.
const prismaMock = {
  camera: {
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
  userAccessScope: {
    findMany: vi.fn(),
  },
  incident: {
    count: vi.fn(),
  },
  referenceImage: {
    count: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  // Runs the callback with prismaMock itself as the transaction client, so
  // tx.camera.delete / tx.auditLog.create resolve to the same spies.
  $transaction: vi.fn(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock)),
};

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));

const { deleteCamera } = await import('./camera.service.js');
const { ConflictError, ForbiddenError, NotFoundError } = await import(
  '../../middleware/errorHandler.js'
);

const actor = { id: 'user-1', role: 'PROJECT_ADMIN' as const, email: 'admin@example.com' };
const reqStub = { ip: '10.0.0.9' } as unknown as Request;

// A full-scope caller: canAccessCamera short-circuits true when scope.all.
const allScope = [{ scopeType: 'ALL', scopeId: null }];

// A Camera row incl. the 6 secret fields that sanitizeCamera must strip.
const cameraRow = {
  id: 'cam-1',
  siteId: 'site-1',
  routerId: 'router-1',
  cameraCode: 'CAM-001',
  name: 'Front Door',
  mainRtspUrlEncrypted: 'enc-main-url',
  subRtspUrlEncrypted: 'enc-sub-url',
  rtspUsernameEncrypted: 'enc-user',
  rtspPasswordEncrypted: 'enc-pass',
  mainRtspHash: 'hash-main',
  subRtspHash: 'hash-sub',
};

const SECRET_FIELDS = [
  'mainRtspUrlEncrypted',
  'subRtspUrlEncrypted',
  'rtspUsernameEncrypted',
  'rtspPasswordEncrypted',
  'mainRtspHash',
  'subRtspHash',
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.camera.findUnique.mockResolvedValue(cameraRow);
  prismaMock.userAccessScope.findMany.mockResolvedValue(allScope);
  prismaMock.incident.count.mockResolvedValue(0);
  prismaMock.referenceImage.count.mockResolvedValue(0);
  prismaMock.camera.delete.mockResolvedValue(cameraRow);
  prismaMock.auditLog.create.mockResolvedValue({});
  prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) =>
    fn(prismaMock)
  );
});

describe('deleteCamera', () => {
  it('throws NotFoundError when the camera does not exist', async () => {
    prismaMock.camera.findUnique.mockResolvedValue(null);
    await expect(deleteCamera('missing', actor, reqStub)).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.camera.delete).not.toHaveBeenCalled();
  });

  it('throws ForbiddenError when the camera is outside the caller scope', async () => {
    prismaMock.userAccessScope.findMany.mockResolvedValue([{ scopeType: 'SITE', scopeId: 'other-site' }]);
    // scope is not ALL → canAccessCamera does a scoped findFirst; return null = no access.
    prismaMock.camera.findFirst = vi.fn().mockResolvedValue(null);
    await expect(deleteCamera('cam-1', actor, reqStub)).rejects.toBeInstanceOf(ForbiddenError);
    expect(prismaMock.camera.delete).not.toHaveBeenCalled();
  });

  it('409s when the camera has recorded incidents', async () => {
    prismaMock.incident.count.mockResolvedValue(2);
    await expect(deleteCamera('cam-1', actor, reqStub)).rejects.toBeInstanceOf(ConflictError);
    expect(prismaMock.camera.delete).not.toHaveBeenCalled();
  });

  it('409s when the camera has approved reference images', async () => {
    prismaMock.referenceImage.count.mockResolvedValue(1);
    await expect(deleteCamera('cam-1', actor, reqStub)).rejects.toBeInstanceOf(ConflictError);
    expect(prismaMock.camera.delete).not.toHaveBeenCalled();
  });

  it('maps Prisma P2003 (retained history) to a 409 ConflictError, not a 500', async () => {
    prismaMock.camera.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('FK constraint', {
        code: 'P2003',
        clientVersion: 'test',
      })
    );
    await expect(deleteCamera('cam-1', actor, reqStub)).rejects.toBeInstanceOf(ConflictError);
  });

  it('rethrows unknown delete errors unchanged (they reach the global errorHandler)', async () => {
    const boom = new Error('db exploded');
    prismaMock.camera.delete.mockRejectedValue(boom);
    await expect(deleteCamera('cam-1', actor, reqStub)).rejects.toBe(boom);
  });

  it('deletes and writes the audit row inside one transaction, with no secrets', async () => {
    await deleteCamera('cam-1', actor, reqStub);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.camera.delete).toHaveBeenCalledWith({ where: { id: 'cam-1' } });
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);

    const auditData = prismaMock.auditLog.create.mock.calls[0][0].data;
    expect(auditData).toMatchObject({
      userId: 'user-1',
      action: 'camera.delete',
      entityType: 'Camera',
      entityId: 'cam-1',
      siteId: 'site-1',
      ipAddress: '10.0.0.9',
    });
    for (const field of SECRET_FIELDS) {
      expect(auditData.oldValue).not.toHaveProperty(field);
    }
  });

  // NOTE: with a mocked Prisma, `$transaction` just runs the callback — it does
  // NOT emulate a real DB rollback. This case therefore proves only that an
  // audit-write failure *propagates* (is surfaced, not swallowed) and is NOT
  // mislabeled as a P2003/409 "retained history" error. True atomic rollback is
  // asserted separately by the integration test (Task 6) against a real DB.
  it('propagates an audit-write failure instead of swallowing it (rollback proven by integration test)', async () => {
    prismaMock.auditLog.create.mockRejectedValue(new Error('audit write failed'));
    const err = await deleteCamera('cam-1', actor, reqStub).catch((e) => e);
    // Surfaced verbatim from inside the transaction, NOT rewritten to a 409.
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ConflictError);
    expect((err as Error).message).toBe('audit write failed');
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});
```

> If `PrismaClientKnownRequestError`'s constructor signature differs in the installed Prisma version (older versions take `(message, code, clientVersion)` positional args), adjust the P2003 test to match. Verify against `node_modules/@prisma/client` if the first run errors on that line.

### Task 2 verification
```
npm --prefix backend test -- src/modules/cameras/camera.service.delete.test.ts   # targeted
npm --prefix backend test                                                        # full regression
```
**Status: DONE.** 9 tests pass; full backend suite 145/145 green; `tsc --noEmit` clean.

Implementation note — the mocked `$transaction` invokes its callback with a **separate `txMock` object** (distinct from the global `prismaMock`), so the suite proves the delete + audit run through the transaction client and that the global client's `camera.delete` / `auditLog.create` stay **uncalled** (`.not.toHaveBeenCalled()`) — a stronger check than reusing one mock. The P2003 case builds a real `new Prisma.PrismaClientKnownRequestError(...)` (prod narrows on `instanceof` + `.code`), the audit `oldValue` is asserted populated with non-secret fields yet free of all 6 credential/hash fields, `siteId` is taken from the server-loaded row, and unknown-delete / audit-write errors are asserted to propagate unchanged (never mislabeled as a 409). Real atomic DB rollback stays out of this mocked suite and is covered by the Task 6 integration test.

---

## TASK 3 — Frontend: `deleteCamera` RTK Query mutation

**File:** `frontend/src/features/cameras/cameras.api.ts`

Add the mutation inside `endpoints: (builder) => ({ … })`, immediately after the `updateCamera` mutation (ends at line 58). Insert:
```ts
      // DELETE /cameras/:id — hard delete, ADMIN_ROLES only (server-enforced).
      // Success-only invalidation: return [] when `error` is set so a failed
      // delete leaves the cached list untouched and the camera stays on screen
      // (req 7). RTK already skips invalidation for a rejected mutation, but
      // branching on `error` makes the guarantee explicit and self-documenting
      // rather than relying on that implicit behaviour.
      deleteCamera: builder.mutation<void, string>({
        query: (id) => ({ url: `/cameras/${id}`, method: 'DELETE' }),
        invalidatesTags: (_result, error, id) =>
          error
            ? []
            : [
                { type: 'Camera' as const, id },
                { type: 'Camera' as const, id: 'LIST' },
              ],
      }),
```

Add the hook to the `export const { … } = camerasApi;` block (after `useUpdateCameraMutation,`):
```ts
  useDeleteCameraMutation,
```

### Task 3 verification
```
npm --prefix frontend run typecheck
```
Expect `useDeleteCameraMutation` to be exported and typed `(id: string) => …`.

---

## TASK 4 — Frontend: `DeleteCameraModal` component

**New file:** `frontend/src/features/cameras/DeleteCameraModal.tsx`

Pure/presentational (all state lives in `CamerasPage`), built on the shared `AnimatedModal`.

```tsx
import { AlertTriangle } from 'lucide-react';
import { AnimatedModal, Button } from '@/components/ui';
import type { Camera } from './cameras.types';

export interface DeleteCameraModalProps {
  open: boolean;
  camera: Camera | null;
  loading: boolean;
  errorMessage: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteCameraModal({
  open,
  camera,
  loading,
  errorMessage,
  onConfirm,
  onCancel,
}: DeleteCameraModalProps): JSX.Element {
  return (
    <AnimatedModal
      open={open}
      // Block Escape / backdrop close mid-delete so we never orphan the request.
      onClose={loading ? () => undefined : onCancel}
      size="sm"
      title="Remove camera?"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-tile bg-coral/10 text-coral">
            <AlertTriangle size={18} strokeWidth={1.75} />
          </span>
          <div className="min-w-0 text-sm">
            <p className="text-secondary">Are you sure you want to remove this camera?</p>
            {camera && (
              <p className="mt-2 font-medium text-ink">
                {camera.name}
                <span className="ml-1 font-normal text-tertiary">
                  · {camera.cameraCode}
                  {camera.site ? ` · ${camera.site.name}` : ''}
                </span>
              </p>
            )}
          </div>
        </div>

        <p className="rounded-tile bg-surface px-3 py-2.5 text-xs leading-relaxed text-tertiary">
          Removing a camera never deletes historical incidents, recordings, snapshots, or health
          records. If the camera has any retained history, it cannot be removed.
        </p>

        {errorMessage && (
          <p role="alert" className="rounded-tile bg-coral/10 px-3 py-2 text-xs font-medium text-coral">
            {errorMessage}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm} loading={loading} disabled={loading}>
            {loading ? 'Deleting…' : 'Delete camera'}
          </Button>
        </div>
      </div>
    </AnimatedModal>
  );
}
```

> The preservation-note text is the approved wording (spec §4.4, refinement #7) — copy verbatim; the frontend test asserts a substring of it.

---

## TASK 5 — Frontend: make `CameraCard` selectable

**File:** `frontend/src/features/cameras/CameraCard.tsx`

### 5a. Add the `Trash2` icon to the lucide import (line 2)
Replace:
```ts
import { Cctv, Wrench } from 'lucide-react';
```
with:
```ts
import { Cctv, Trash2, Wrench } from 'lucide-react';
```

### 5b. Extend the props (replace lines 18-24)
Replace:
```tsx
export function CameraCard({
  camera,
  onOpen,
}: {
  camera: Camera;
  onOpen: (id: string) => void;
}): JSX.Element {
```
with:
```tsx
export function CameraCard({
  camera,
  onOpen,
  selectable = false,
  onSelect,
}: {
  camera: Camera;
  onOpen: (id: string) => void;
  /** In selection mode the card picks the camera for deletion instead of navigating. */
  selectable?: boolean;
  onSelect?: (camera: Camera) => void;
}): JSX.Element {
```

### 5c. Rewire the click + add the overlay indicator (replace lines 29-33)
Replace:
```tsx
      <button
        type="button"
        onClick={() => onOpen(camera.id)}
        className="w-full rounded-card bg-card p-5 text-left shadow-soft transition-shadow duration-150 hover:shadow-soft-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
      >
```
with:
```tsx
      <button
        type="button"
        onClick={() => (selectable ? onSelect?.(camera) : onOpen(camera.id))}
        aria-pressed={selectable ? false : undefined}
        aria-label={selectable ? `Select ${camera.name} to delete` : undefined}
        className={cn(
          'relative w-full rounded-card bg-card p-5 text-left shadow-soft transition-shadow duration-150 hover:shadow-soft-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage',
          selectable && 'ring-2 ring-coral/40 hover:ring-coral'
        )}
      >
        {selectable && (
          <span
            aria-hidden
            className="pointer-events-none absolute -right-2 -top-2 z-10 grid h-6 w-6 place-items-center rounded-full border-2 border-coral bg-card shadow-soft"
          >
            <Trash2 size={12} className="text-coral" />
          </span>
        )}
```
Notes:
- `cn` is already imported (line 3). The indicator is an **overlay** (`absolute`, offset to the corner) so the default card layout/spacing is unchanged when `!selectable` (req 3), and it sits clear of the top-right `CameraStatusBadge`.
- **The overlay is a purely visual affordance, NOT a control.** It is a `<span aria-hidden>` with `pointer-events-none` — deliberately *not* an `<input type="checkbox">` or a nested `<button>`. Nesting an interactive control inside the card's `<button>` is invalid HTML (interactive content may not contain interactive content) and produces a double–focus-stop / nested-click target. The card `<button>` remains the single interactive element; all selection semantics live on it via `onClick` → `onSelect`, `aria-pressed`, and the `aria-label` accessible name. The Trash2 span only *shows* that selection mode is active.
- The rest of the card body (through the closing `</button></motion.article>`) is unchanged. The existing `<motion.article variants={listItem}>` wrapper stays as-is.

---

## TASK 6 — Frontend: `CamerasPage` action bar + selection + delete flow

**File:** `frontend/src/features/cameras/CamerasPage.tsx`

### 6a. Imports
- Add `Trash2` to the lucide block: insert `  Trash2,` right before `  X,` (line 13).
- Line 17: `import { isCameraWriteRole } from '@/features/auth/auth.types';` →
  `import { isAdminRole, isCameraWriteRole } from '@/features/auth/auth.types';`
- Line 26: `import { useListCamerasQuery, useListSitesLiteQuery } from './cameras.api';` →
  `import { useDeleteCameraMutation, useListCamerasQuery, useListSitesLiteQuery } from './cameras.api';`
- Line 27: `import type { CameraStatus } from './cameras.types';` →
  `import type { Camera, CameraStatus } from './cameras.types';`
- After the `CameraMapView` import (line 25), add:
  `import { DeleteCameraModal } from './DeleteCameraModal';`

### 6b. State + mutation + a danger-outline style constant
Immediately after line 76 (`const canRegister = isCameraWriteRole(user?.role);`) insert:
```ts
  const canDelete = isAdminRole(user?.role); // mirrors backend ADMIN_ROLES (server still enforces)
  const [selecting, setSelecting] = useState(false);
  const [prevView, setPrevView] = useState<'grid' | 'map' | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Camera | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [del, { isLoading: isDeleting }] = useDeleteCameraMutation();
```
Add this module-level constant near `PAGE_SIZE` (line 30). Danger-outline = the `outline` variant re-tinted with the `danger` variant's coral token via `className` (refinement #1 — no new global variant); `cn`/tailwind-merge makes these win over the outline defaults:
```ts
const DANGER_OUTLINE =
  'border-coral text-coral hover:bg-coral/10 hover:border-coral focus-visible:ring-coral';
```

### 6c. Selection handlers
Insert just before `return (` (after the `const totalPages = …` line, line 150):
```ts
  function enterSelection() {
    if (view === 'map') {
      setPrevView('map'); // selection is grid-only (needs the cards); remember to restore Map after
      setView('grid');
    }
    setSelecting(true);
  }

  function exitSelection() {
    setSelecting(false);
    setPendingDelete(null);
    setErrorMessage(null);
    if (prevView) {
      setView(prevView);
      setPrevView(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setErrorMessage(null);
    try {
      await del(pendingDelete.id).unwrap();
      success('Camera removed');
      exitSelection(); // closes modal, exits selection, restores previous view; tags refetch the list
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err)); // immediate, from the caught error → modal stays open, camera stays
    }
  }
```

### 6d. Action bar — add Delete camera / Cancel (button order: Refresh → Add camera → Delete camera)
Replace the `canRegister` block (lines 176-180):
```tsx
          {canRegister && (
            <Button size="sm" onClick={() => setAddOpen(true)} leftIcon={<Plus size={14} />}>
              Add camera
            </Button>
          )}
        </div>
```
with:
```tsx
          {canRegister && (
            <Button size="sm" onClick={() => setAddOpen(true)} leftIcon={<Plus size={14} />}>
              Add camera
            </Button>
          )}
          {canDelete &&
            (selecting ? (
              <Button variant="secondary" size="sm" onClick={exitSelection}>
                Cancel
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className={DANGER_OUTLINE}
                onClick={enterSelection}
                leftIcon={<Trash2 size={14} />}
              >
                Delete camera
              </Button>
            ))}
        </div>
```

### 6e. Instruction banner
Between the filter row's closing `</motion.div>` and the `{view === 'map' ? (` block (lines 271-273), insert:
```tsx
      {selecting && (
        <motion.div
          variants={pageChild}
          className="rounded-card border border-hairline bg-card px-4 py-2.5 text-sm text-secondary shadow-soft"
          role="status"
        >
          Select a camera to delete.
        </motion.div>
      )}
```

### 6f. Wire selection into the grid cards
Replace the grid `CameraCard` map (lines 303-309):
```tsx
          {data.items.map((camera) => (
            <CameraCard
              key={camera.id}
              camera={camera}
              onOpen={(id) => navigate(`/cameras/${id}`)}
            />
          ))}
```
with:
```tsx
          {data.items.map((camera) => (
            <CameraCard
              key={camera.id}
              camera={camera}
              onOpen={(id) => navigate(`/cameras/${id}`)}
              selectable={selecting}
              onSelect={(cam) => {
                setErrorMessage(null);
                setPendingDelete(cam);
              }}
            />
          ))}
```

### 6g. Mount the modal
Between the `<AddCameraModal … />` block and `<ToastContainer … />` (lines 357-363), insert:
```tsx
      <DeleteCameraModal
        open={pendingDelete !== null}
        camera={pendingDelete}
        loading={isDeleting}
        errorMessage={errorMessage}
        onConfirm={confirmDelete}
        onCancel={() => {
          setPendingDelete(null); // cancel the popup but stay in selection mode to pick another
          setErrorMessage(null);
        }}
      />
```

### Task 6 verification
```
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```
Manually reason through: `Camera` type imported, `useDeleteCameraMutation` imported, `Trash2`/`isAdminRole`/`DeleteCameraModal` imported, no unused vars.

---

## TASK 7 — Frontend tests

### 7a. `frontend/src/features/cameras/DeleteCameraModal.test.tsx` (pure component)
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteCameraModal } from './DeleteCameraModal';
import type { Camera } from './cameras.types';

const camera = {
  id: 'cam-1',
  cameraCode: 'CAM-001',
  name: 'Front Door',
  site: { id: 'site-1', name: 'HQ' },
} as unknown as Camera;

function setup(overrides: Partial<React.ComponentProps<typeof DeleteCameraModal>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <DeleteCameraModal
      open
      camera={camera}
      loading={false}
      errorMessage={null}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />
  );
  return { onConfirm, onCancel };
}

describe('DeleteCameraModal', () => {
  it('shows the camera name, code, site and the preservation note', () => {
    setup();
    expect(screen.getByText('Front Door')).toBeInTheDocument();
    expect(screen.getByText(/CAM-001/)).toBeInTheDocument();
    expect(screen.getByText(/HQ/)).toBeInTheDocument();
    expect(screen.getByText(/never deletes historical incidents/i)).toBeInTheDocument();
  });

  it('calls onCancel and onConfirm from the buttons', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = setup();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /delete camera/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows "Deleting…" and disables both buttons while loading', () => {
    setup({ loading: true });
    expect(screen.getByRole('button', { name: /deleting/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });

  it('renders the error message and keeps the modal open', () => {
    setup({ errorMessage: 'This camera cannot be removed because it still has recorded history.' });
    expect(screen.getByRole('alert')).toHaveTextContent(/recorded history/i);
    expect(screen.getByText('Front Door')).toBeInTheDocument();
  });
});
```

### 7b. `frontend/src/features/cameras/CamerasPage.delete.test.tsx` (page behavior)
Mock the api hooks + auth + toast; stub the heavy child components so only the page logic is under test. Render inside `MemoryRouter` (the page uses `useNavigate`/`useParams`/`useSearchParams`).

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// vi.mock factories are hoisted above these declarations, so anything they
// reference must live in vi.hoisted() (otherwise: TDZ "cannot access before
// initialization"). Keep del/successToast/role here so the factories can use them.
const h = vi.hoisted(() => ({
  del: vi.fn(() => ({ unwrap: () => Promise.resolve() })),
  successToast: vi.fn(),
  role: 'PROJECT_ADMIN' as string,
}));

const cameras = [
  { id: 'cam-1', name: 'Front Door', cameraCode: 'CAM-001', status: 'HEALTHY', healthScore: 90, maintenanceMode: false, site: { id: 's1', name: 'HQ' } },
  { id: 'cam-2', name: 'Lobby', cameraCode: 'CAM-002', status: 'WARNING', healthScore: 60, maintenanceMode: false, site: { id: 's1', name: 'HQ' } },
];

vi.mock('./cameras.api', () => ({
  useListCamerasQuery: () => ({
    data: { items: cameras, total: cameras.length, page: 1, limit: 24 },
    isLoading: false,
    isFetching: false,
    error: undefined,
    refetch: vi.fn(),
  }),
  useListSitesLiteQuery: () => ({ data: { items: [], total: 0, page: 1, limit: 100 } }),
  useDeleteCameraMutation: () => [h.del, { isLoading: false }],
}));
vi.mock('@/features/auth/auth.api', () => ({
  useGetCurrentUserQuery: () => ({ data: { id: 'u1', role: h.role } }),
}));
vi.mock('@/features/overview/overview.api', () => ({
  useListZoneSummariesQuery: () => ({ data: undefined }),
}));
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toasts: [], dismiss: vi.fn(), success: h.successToast, error: vi.fn() }),
}));
// Stub heavy children so we test only page logic (avoids maplibre etc.).
vi.mock('./CameraMapView', () => ({ CameraMapView: () => <div data-testid="map" /> }));
vi.mock('./AddCameraModal', () => ({ AddCameraModal: () => null }));
vi.mock('./CameraDetailDrawer', () => ({ CameraDetailDrawer: () => null }));

import { CamerasPage } from './CamerasPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/cameras']}>
      <CamerasPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.role = 'PROJECT_ADMIN';
  // clearAllMocks wipes call history but not the base impl; restore a clean
  // resolving default so a prior mockReturnValueOnce can't leak between tests.
  h.del.mockReturnValue({ unwrap: () => Promise.resolve() });
});

describe('CamerasPage — delete', () => {
  it('renders action buttons in order Refresh → Add camera → Delete camera', () => {
    renderPage();
    const labels = screen
      .getAllByRole('button')
      .map((b) => b.textContent?.trim())
      .filter((t) => t === 'Refresh' || t === 'Add camera' || t === 'Delete camera');
    expect(labels.slice(0, 3)).toEqual(['Refresh', 'Add camera', 'Delete camera']);
  });

  it('hides Delete camera for non-admins', () => {
    h.role = 'OPERATOR';
    renderPage();
    expect(screen.queryByRole('button', { name: /delete camera/i })).not.toBeInTheDocument();
  });

  it('enters selection mode: banner + Cancel + a card click opens the modal (no navigate)', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /delete camera/i }));
    expect(screen.getByText('Select a camera to delete.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /select front door to delete/i }));
    expect(screen.getByText(/are you sure you want to remove this camera/i)).toBeInTheDocument();
  });

  it('confirms a delete → mutation called, success toast, modal closes', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /delete camera/i }));
    await user.click(screen.getByRole('button', { name: /select front door to delete/i }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^delete camera$/i }));
    expect(h.del).toHaveBeenCalledWith('cam-1');
    expect(h.successToast).toHaveBeenCalledWith('Camera removed');
    // AnimatePresence exit can linger a tick under jsdom — wait for the unmount.
    await waitFor(() =>
      expect(screen.queryByText(/are you sure you want to remove/i)).not.toBeInTheDocument()
    );
  });

  it('on failure keeps the modal open, shows the error, and leaves the camera in the list', async () => {
    h.del.mockReturnValueOnce({
      unwrap: () => Promise.reject({ status: 409, data: { error: { code: 'CONFLICT', message: 'still has recorded history' } } }),
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /delete camera/i }));
    await user.click(screen.getByRole('button', { name: /select front door to delete/i }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^delete camera$/i }));
    expect(await screen.findByText(/still has recorded history/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Front Door')).toBeInTheDocument();
  });
});
```

Notes / likely adjustments during the run:
- The card's accessible name comes from `CameraCard`'s `aria-label={`Select ${camera.name} to delete`}` (Task 5c). If the a11y query misses, fall back to clicking the card by its visible `Front Door` text.
- `CameraStatusBadge`, `Input`, `SkeletonCard`, `ToastContainer`, framer-motion render fine under jsdom; do not mock them.
- If `useSearchParams`/`useParams` cause issues, the `MemoryRouter` wrapper already supplies them — do **not** mock react-router.

### Task 7 verification
```
npm --prefix frontend run test -- DeleteCameraModal CamerasPage.delete
```

---

## TASK 8 — Full verification (no commit / no push)

Run and report **all** results honestly, even failures:
```
# Backend
npm --prefix backend run typecheck
npm --prefix backend run test -- camera.service.delete

# Frontend
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run test -- DeleteCameraModal CamerasPage.delete
```
If the working tree is clean enough, attempt a build:
```
npm --prefix frontend run build
```
Coverage must stay within existing thresholds (lines 70 / functions 70 / branches 60 / statements 70). Do **not** `git commit` or `git push`.

---

## 9. Risks & rollback

- **P2003 constructor signature** varies across Prisma versions — the only test likely to need a tweak (Task 2). Backend prod code uses `instanceof` + `.code`, which is version-stable.
- **tailwind-merge and custom tokens:** `DANGER_OUTLINE` relies on `cn()` overriding the `outline` variant's `border-sage`/`text-sage`/`ring-sage`. Visually confirm the Delete button is red (border, text, hover fill, focus ring) — if a class doesn't win, make the override more specific.
- **Indicator vs. status badge overlap:** the selection chip is corner-offset (`-right-2 -top-2`) to clear the top-right `CameraStatusBadge`. Eyeball it at `sm`/`xl` grid breakpoints.
- **Rollback:** all changes are additive except the `deleteCamera` body and two service import lines; reverting those three hunks + deleting the 3 new files fully restores prior behavior. No migration to undo.

## 10. Definition of done

- [ ] `deleteCamera` deletes + audits in one `$transaction`; P2003 → 409; unknown errors rethrown.
- [ ] Backend delete tests pass (missing/forbidden/incidents/reference-images/P2003→409/unknown-rethrow/atomic-audit/no-secrets).
- [ ] `useDeleteCameraMutation` invalidates `Camera` id + `LIST` on success only.
- [ ] Action bar shows **Refresh → Add camera → Delete camera**; Delete hidden for non-admins; Delete↔Cancel toggle in selection mode.
- [ ] Cards become selectable overlays (layout unchanged otherwise); a card click opens the confirm modal instead of navigating.
- [ ] Modal shows details + approved preservation note; success closes it, toasts, restores the prior view; failure keeps it open, shows the real error, camera stays.
- [ ] Cancel exits selection and restores Map→Grid→Map.
- [ ] Both frontend test files pass; typecheck + lint clean; coverage within thresholds.
- [ ] No commit, no push; results reported honestly.
