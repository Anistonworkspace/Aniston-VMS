# Skill — Modal & Dialog Patterns

Create modal, edit modal, escalate/remove confirmation, drawer, nested modals — all with correct state management.

Design tokens: see `docs/04-uiux-brief.md`.

---

## Base modal component

```tsx
// frontend/src/components/ui/Modal.tsx
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

const SIZE_CLASS = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: keyof typeof SIZE_CLASS;
  children: ReactNode;
}

export function Modal({ open, onClose, title, size = 'md', children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[var(--modal-z-index)] flex items-center justify-center bg-[var(--backdrop-color)] p-4" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog" aria-modal="true" aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${SIZE_CLASS[size]} bg-[var(--card)] rounded-[var(--card-radius)] shadow-[var(--box-shadow-large)] p-6`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-[var(--ink)]">{title}</h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--ink)]" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
```

## Confirm dialog — Escalate Incident

Manually escalating an incident (bypassing the timed escalation ladder in `docs/03-app-flow.md` §3) is a deliberate, auditable action — always confirm, never a single-click toggle.

```tsx
// frontend/src/components/ui/ConfirmDialog.tsx
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
  isLoading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', variant = 'default', isLoading, onConfirm, onClose }: ConfirmDialogProps) {
  const btnClass = variant === 'danger' ? 'btn-danger' : variant === 'warning' ? 'btn-warning' : 'btn-primary';
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-[var(--muted)] mb-6">{description}</p>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn btn-ghost" disabled={isLoading}>Cancel</button>
        <button onClick={onConfirm} className={`btn ${btnClass}`} disabled={isLoading}>
          {isLoading ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
```

```tsx
// frontend/src/features/incidents/EscalateIncidentAction.tsx
export function EscalateIncidentAction({ incident }: { incident: Incident }) {
  const [open, setOpen] = useState(false);
  const [escalateIncident, { isLoading }] = useEscalateIncidentMutation();

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-ghost btn-sm text-[var(--coral)]">Escalate now</button>
      <ConfirmDialog
        open={open}
        title={`Escalate ${incident.code}?`}
        description={`This immediately notifies the next tier (ops head) for ${incident.cameraName} in ${incident.zoneName}, ahead of the normal timer. This action is written to the audit trail.`}
        confirmLabel="Escalate"
        variant="warning"
        isLoading={isLoading}
        onConfirm={async () => { await escalateIncident({ id: incident.id }).unwrap(); setOpen(false); }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
```

`incident.code` follows the `ANI-CAM-YYYY-NNNNNN` format (e.g. `ANI-CAM-2026-000145`) — always reference the human-readable code in confirm copy, never the raw database id.

## Delete confirmation — Remove Camera

```tsx
export function RemoveCameraAction({ camera }: { camera: Camera }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [removeCamera, { isLoading }] = useRemoveCameraMutation();

  return (
    <>
      <button onClick={() => setDeleteOpen(true)} className="btn btn-ghost btn-sm text-[var(--coral)]">Remove</button>
      <ConfirmDialog
        open={deleteOpen}
        title={`Remove ${camera.code} — ${camera.name}?`}
        description="This stops monitoring and removes the camera from the live wall. Historical incidents and recordings are kept for audit and playback."
        confirmLabel="Remove camera"
        variant="danger"
        isLoading={isLoading}
        onConfirm={async () => { await removeCamera({ id: camera.id }).unwrap(); setDeleteOpen(false); }}
        onClose={() => setDeleteOpen(false)}
      />
    </>
  );
}
```

Note the soft-delete framing in the copy — cameras are never hard-deleted while incidents/recordings reference them; `removeCamera` sets `deletedAt` and unregisters the live path, it doesn't drop the row.

## Nested modals — Add Camera → Create Zone (inline)

```tsx
function AddCameraModal({ onClose }: { onClose: () => void }) {
  const [createZoneOpen, setCreateZoneOpen] = useState(false);
  const { setValue } = useFormContext<CreateCameraInput>();
  // ... AddCameraModal form fields as in skill-form-patterns.md, with a "+ New zone" link next to the zone select

  return (
    <Modal open onClose={onClose} title="Add camera">
      {/* form fields */}
      <button type="button" onClick={() => setCreateZoneOpen(true)} className="text-xs text-[var(--primary-color)]">+ New zone</button>
      <Modal open={createZoneOpen} onClose={() => setCreateZoneOpen(false)} title="New zone" size="sm">
        <CreateZoneForm onCreated={(zone) => { setValue('zoneId', zone.id); setCreateZoneOpen(false); }} />
      </Modal>
    </Modal>
  );
}
```

Only two z-index layers ever stack (`--modal-z-index` and `--modal-z-index` + 10 for the nested one) — don't let a third modal open on top of a second; close or disable the parent's interaction instead.

## Drawer — Camera / Zone detail side panel

```tsx
// frontend/src/components/ui/Drawer.tsx
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: 'right' | 'left';
  children: ReactNode;
}

export function Drawer({ open, onClose, side = 'right', children }: DrawerProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return createPortal(
    <div className={`fixed inset-0 z-[var(--modal-z-index)] ${open ? '' : 'pointer-events-none'}`}>
      <div className={`absolute inset-0 bg-[var(--backdrop-color)] transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
      <div
        className={`absolute top-0 ${side}-0 h-full w-full max-w-md bg-[var(--card)] shadow-[var(--box-shadow-large)] transition-transform duration-200 ease-[var(--easing-sidebar)]
          ${open ? 'translate-x-0' : side === 'right' ? 'translate-x-full' : '-translate-x-full'}`}
      >
        <div className="h-full overflow-y-auto p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
```

Used for the camera detail panel opened from `LiveWallGrid` (health check history, `EscalationTimeline`, `SnapshotCompare`) — a drawer, not a full modal, because the wall stays visible behind it and the operator can keep watching while reading detail.

## Camera action menu

```tsx
// frontend/src/features/camera/CameraActionMenu.tsx
export function CameraActionMenu({ camera }: { camera: Camera }) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="btn btn-ghost btn-icon">⋮</button>
      {open && (
        <div className="absolute right-0 mt-1 w-44 bg-[var(--card)] rounded-[var(--radius-medium)] shadow-lg border border-[var(--hairline)] py-1 z-10">
          <button onClick={() => { setEditOpen(true); setOpen(false); }} className="menu-item">Edit camera</button>
          <button onClick={() => moveCamera(camera.id)} className="menu-item">Move to zone…</button>
          <RemoveCameraAction camera={camera} />
        </div>
      )}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit ${camera.code}`}>
        <EditCameraForm camera={camera} onClose={() => setEditOpen(false)} />
      </Modal>
    </div>
  );
}
```

## Checklist

- [ ] Every modal traps focus (`useFocusTrap`) and restores focus to the trigger element on close
- [ ] `Escape` closes the topmost layer only — nested modal, then parent, then drawer, never two at once
- [ ] Destructive/high-impact actions (`Remove camera`, `Escalate incident`) always go through `ConfirmDialog`, never a bare `onClick`
- [ ] Confirm-dialog copy names the specific entity (`camera.code`, `incident.code`) — never a generic "Are you sure?"
- [ ] `isLoading` disables both buttons and shows a busy label — prevents double-submit on slow networks
- [ ] `createPortal` used for Modal/Drawer so ancestor `z-index`/`overflow: hidden` never clips them
- [ ] Body scroll locked while any modal/drawer is open, restored on close
- [ ] Drawer used (not a full modal) whenever the underlying view — the live wall — should stay visible/interactive behind it
- [ ] Nested modal depth capped at 2; z-index values come from tokens (`--modal-z-index`), never ad-hoc magic numbers