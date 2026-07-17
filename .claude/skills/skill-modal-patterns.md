# Skill — Modal & Dialog Patterns

Create modal, edit modal, delete confirmation, drawer, nested modals — all with correct state management.

---

## Base modal component

```typescript
// frontend/src/components/ui/Modal.tsx
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  open:     boolean;
  onClose:  () => void;
  title:    string;
  children: React.ReactNode;
  size?:    'sm' | 'md' | 'lg' | 'xl';
  footer?:  React.ReactNode;
}

const SIZE_CLASS = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

export function Modal({ open, onClose, title, children, size = 'md', footer }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else      document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="detail-modal-backdrop fixed inset-0 z-[var(--modal-z-index)] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`floating-card rounded-[var(--card-radius)] w-full ${SIZE_CLASS[size]} max-h-[90vh] flex flex-col page-enter`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] flex-shrink-0">
          <h2 id="modal-title" className="text-base font-semibold text-[var(--primary-text-color)]">{title}</h2>
          <button className="btn btn--ghost btn--icon btn--sm" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {/* Footer — optional */}
        {footer && (
          <div className="px-6 py-4 border-t border-[var(--border-color)] flex justify-end gap-3 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
```

---

## Create modal — standard usage

```typescript
function ItemListPage() {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <button className="btn btn--primary btn--md" onClick={() => setCreateOpen(true)}>
        + New Item
      </button>

      <CreateItemModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </>
  );
}
```

---

## Edit modal — pre-populate without stale data

```typescript
// ❌ WRONG — stale form values persist between opens
const form = useForm({ defaultValues: { name: record?.name } });

// ✅ CORRECT — use `values` so form syncs when record prop changes
const form = useForm<UpdateInput>({
  resolver: zodResolver(UpdateSchema),
  values: record ? { name: record.name, type: record.type } : undefined,
});

// ✅ ALSO RESET when modal closes
useEffect(() => {
  if (!open) {
    form.reset();        // clears validation errors AND values
  }
}, [open, form]);
```

---

## Delete confirmation dialog

```typescript
// frontend/src/components/ui/ConfirmDialog.tsx
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open:        boolean;
  onClose:     () => void;
  onConfirm:   () => void;
  title:       string;
  description: string;
  confirmLabel?: string;
  variant?:    'danger' | 'warning';
  isLoading?:  boolean;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Delete', variant = 'danger', isLoading }: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title="" size="sm">
      <div className="text-center space-y-4">
        <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center ${variant === 'danger' ? 'bg-[rgba(216,58,82,0.12)]' : 'bg-[rgba(255,203,0,0.2)]'}`}>
          <AlertTriangle className={`h-6 w-6 ${variant === 'danger' ? 'text-[var(--negative-color)]' : 'text-[var(--warning-color)]'}`} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-[var(--primary-text-color)]">{title}</h3>
          <p className="text-sm text-[var(--secondary-text-color)] mt-1">{description}</p>
        </div>
        <div className="flex gap-3">
          <button className="btn btn--secondary btn--md flex-1" onClick={onClose} disabled={isLoading}>Cancel</button>
          <button className={`btn btn--md flex-1 ${variant === 'danger' ? 'btn--negative' : 'btn--primary'}`}
            onClick={onConfirm} disabled={isLoading}>
            {isLoading ? '⟳' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
```

---

## Delete confirmation usage

```typescript
function ItemActionMenu({ id, status }: { id: string; status: string }) {
  const [deleteOpen, setDeleteOpen]   = useState(false);
  const [deleteItem, { isLoading }]   = useDeleteItemMutation();

  const handleDelete = async () => {
    try {
      await deleteItem(id).unwrap();
      toast.success('Item deleted');
      setDeleteOpen(false);
    } catch {
      toast.error('Failed to delete');
    }
  };

  return (
    <>
      <button className="btn btn--negative btn--sm" onClick={() => setDeleteOpen(true)}>Delete</button>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete item?"
        description="This action cannot be undone. The item will be permanently removed."
        confirmLabel="Yes, delete"
        variant="danger"
        isLoading={isLoading}
      />
    </>
  );
}
```

---

## Drawer (side panel) for detail view

```typescript
// frontend/src/components/ui/Drawer.tsx
interface DrawerProps {
  open:     boolean;
  onClose:  () => void;
  title:    string;
  children: React.ReactNode;
  side?:    'right' | 'left';
}

export function Drawer({ open, onClose, title, children, side = 'right' }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[9999] transition-opacity duration-[250ms] ${open ? 'bg-[var(--backdrop-color)] opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      {/* Panel */}
      <div className={`fixed top-0 ${side === 'right' ? 'right-0' : 'left-0'} h-full w-full max-w-md bg-[var(--primary-background-color)] shadow-[var(--box-shadow-large)] z-[10000] flex flex-col
        transition-transform duration-[280ms] [transition-timing-function:var(--easing-sidebar)]
        ${open ? 'translate-x-0' : side === 'right' ? 'translate-x-full' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="btn btn--ghost btn--icon btn--sm" onClick={onClose}>✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </>,
    document.body,
  );
}
```

---

## Checklist

- [ ] Modal closes on `Escape` key press
- [ ] Modal closes on backdrop click (clicking outside the panel)
- [ ] Body scroll locked while modal is open (`overflow: hidden`)
- [ ] Modal rendered via `createPortal` — not in the component tree (prevents overflow/z-index issues)
- [ ] `aria-modal="true"` and `aria-labelledby` for accessibility
- [ ] Edit form uses `values:` not `defaultValues:` — re-syncs when record prop changes
- [ ] `form.reset()` called when modal closes — prevents stale validation errors on next open
- [ ] Delete confirmation: two-step (button → dialog → confirm) — never one-click delete
- [ ] Loading state on confirm button — disabled during mutation
- [ ] Drawer uses CSS transform animation, not JS-driven animation
