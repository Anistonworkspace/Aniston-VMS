# Skill — Drag & Drop Patterns (dnd-kit)

Sortable lists, kanban boards, file drop zones, multi-select drag. Uses
`@dnd-kit/core` + `@dnd-kit/sortable` — accessibility-first (keyboard support
built in) and mobile-friendly.

Prereqs:

```powershell
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Framer Motion for optional layout animations. Reuse design tokens (radii,
shadows) — no ad-hoc styling.

---

## Pattern 1 — Sortable list

The core case: reorder items, persist the order via RTK Query.

```typescript
// frontend/src/features/notes/NoteList.tsx
import {
  DndContext, DragEndEvent, KeyboardSensor, PointerSensor,
  closestCenter, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import { useReorderNotesMutation, useListNotesQuery } from './notesApi';

export function NoteList() {
  const { data } = useListNotesQuery();
  const [reorder] = useReorderNotesMutation();
  const [items, setItems] = useState(data?.data ?? []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);                    // optimistic UI
    reorder({ ids: next.map((i) => i.id) })
      .unwrap()
      .catch(() => setItems(items));   // rollback on failure
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {items.map((it) => <SortableRow key={it.id} note={it} />)}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ note }: { note: Note }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: note.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`floating-card flex items-center gap-3 rounded-[var(--radius-medium)] p-3 ${isDragging ? 'opacity-50' : ''}`}
      {...attributes}
    >
      <button
        {...listeners}
        aria-label="Reorder"
        className="cursor-grab touch-none text-[var(--tertiary-text-color)] active:cursor-grabbing"
      >
        ⋮⋮
      </button>
      <span>{note.title}</span>
    </li>
  );
}
```

**RTK Query mutation shape** for the reorder endpoint:

```typescript
reorderNotes: builder.mutation<void, { ids: string[] }>({
  query: (body) => ({ url: '/notes/reorder', method: 'POST', body }),
  invalidatesTags: [{ type: 'Note', id: 'LIST' }],
}),
```

**Backend service** — batch-update the `order` field in one transaction:

```typescript
static async reorder(ids: string[], actor: AuthUser) {
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.note.update({
        where: { id, organizationId: actor.organizationId },
        data: { order: index },
      }),
    ),
  );
  await auditLogger.log(/* action: 'NOTE_REORDERED' */);
}
```

---

## Pattern 2 — Kanban board (multi-column)

Cards can move within a column OR across columns. Two `SortableContext`s.

```typescript
// Types
type Column = { id: string; title: string; cardIds: string[] };
type Card = { id: string; title: string; columnId: string };

// State: columns + cards, keyed by id for O(1) lookup

function Kanban({ columns, cards }: { columns: Column[]; cards: Record<string, Card> }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;

    const activeCol = columns.find((c) => c.cardIds.includes(active.id as string));
    const overCol   = columns.find((c) => c.id === over.id || c.cardIds.includes(over.id as string));
    if (!activeCol || !overCol) return;

    if (activeCol.id === overCol.id) {
      // Reorder within column
      const oldIndex = activeCol.cardIds.indexOf(active.id as string);
      const newIndex = overCol.cardIds.indexOf(over.id as string);
      activeCol.cardIds = arrayMove(activeCol.cardIds, oldIndex, newIndex);
    } else {
      // Move across columns
      activeCol.cardIds = activeCol.cardIds.filter((id) => id !== active.id);
      overCol.cardIds.push(active.id as string);
      cards[active.id as string].columnId = overCol.id;
    }
    // Persist via RTK Query mutation…
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto p-4">
        {columns.map((col) => (
          <div key={col.id} className="floating-card min-w-[280px] rounded-[var(--radius-big)] p-3">
            <h3 className="mb-2 font-medium">{col.title}</h3>
            <SortableContext items={col.cardIds} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2">
                {col.cardIds.map((id) => <KanbanCard key={id} card={cards[id]} />)}
              </ul>
            </SortableContext>
          </div>
        ))}
      </div>
    </DndContext>
  );
}
```

---

## Pattern 3 — File drop zone

Drop files onto the page, show a progress ring per file, upload via RTK
Query mutation.

```typescript
import { useDropzone } from 'react-dropzone';        // npm install react-dropzone
import { useState } from 'react';

export function FileDropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [active, setActive] = useState(false);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => { setActive(false); onFiles(files); },
    onDragEnter: () => setActive(true),
    onDragLeave: () => setActive(false),
    accept: { 'image/*': [], 'application/pdf': ['.pdf'] },
    maxSize: 5 * 1024 * 1024,
  });

  return (
    <div
      {...getRootProps()}
      className={`floating-card rounded-[var(--radius-big)] border-2 border-dashed p-8 text-center transition ${
        active || isDragActive
          ? 'border-[var(--primary-color)] bg-[rgba(0,115,234,0.04)]'
          : 'border-[var(--layout-border-color)]'
      }`}
    >
      <input {...getInputProps()} />
      <p className="text-sm text-[var(--secondary-text-color)]">
        {isDragActive ? 'Drop to upload…' : 'Drop files here or click to browse'}
      </p>
      <p className="mt-1 text-xs text-[var(--tertiary-text-color)]">
        PNG · JPG · WebP · PDF · Max 5 MB per file
      </p>
    </div>
  );
}
```

Pair with `skill-file-upload-patterns.md` for the RTK Query upload mutation
and progress reporting.

---

## Pattern 4 — Multi-select drag

Select multiple rows (shift-click), drag them as a group.

```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

const onRowClick = (id: string, e: React.MouseEvent) => {
  if (e.shiftKey) {
    // range-select via last-clicked pivot
  } else if (e.metaKey || e.ctrlKey) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  } else {
    setSelectedIds(new Set([id]));
  }
};

// In onDragStart — if active.id is in the selection, drag all selected.
// Otherwise drag only active.
const onDragStart = (e: DragStartEvent) => {
  const draggedIds = selectedIds.has(e.active.id as string)
    ? [...selectedIds]
    : [e.active.id as string];
  // stash in a ref, use in DragOverlay
};

// Show a "grouped" DragOverlay when > 1 item is being moved:
<DragOverlay>
  {activeId && (draggedIds.length > 1 ? <StackedCards count={draggedIds.length} /> : <SingleCard id={activeId} />)}
</DragOverlay>
```

---

## Pattern 5 — Persistence with optimistic update

Optimistic UI = update local state immediately, then confirm with the API.

```typescript
const onDragEnd = async (e: DragEndEvent) => {
  const before = items;                                // snapshot
  const next   = arrayMove(items, oldIndex, newIndex);
  setItems(next);                                      // optimistic

  try {
    await reorder({ ids: next.map((i) => i.id) }).unwrap();
    toast.success('Order saved');
  } catch (err) {
    setItems(before);                                  // rollback
    toast.error('Could not save new order — reverted');
  }
};
```

**Rule:** never dispatch an optimistic update without a rollback path. Users
will get confused when a network error appears to succeed.

---

## Accessibility notes

`@dnd-kit` ships with keyboard support out of the box. Verify:

- **Tab** to focus a drag handle
- **Space** to pick up
- **Arrow keys** to move
- **Space** to drop
- **Escape** to cancel

Announce state changes via `<DndContext accessibility={{ announcements }}>`:

```typescript
const announcements = {
  onDragStart: ({ active }) => `Picked up ${active.data.current?.title}.`,
  onDragOver:  ({ active, over }) => `Moving ${active.data.current?.title} over ${over?.data.current?.title}.`,
  onDragEnd:   ({ active, over }) => `Dropped ${active.data.current?.title} onto ${over?.data.current?.title}.`,
  onDragCancel: ({ active }) => `Cancelled dragging ${active.data.current?.title}.`,
};
```

---

## Do-not

- **No PointerSensor without `activationConstraint`** — accidental drags
  break click targets. Default: `{ distance: 8 }` (8px before drag starts) or
  `{ delay: 250, tolerance: 5 }`.
- **No drag handle without `touch-none`** — mobile browsers eat the touch
  event as a scroll.
- **No missing keyboard sensor** — accessibility failure.
- **No optimistic update without rollback**.
- **No `DragOverlay` for tiny items** — the "portal-rendered ghost" costs
  more than it's worth on lists of 10-line rows. Skip it and let the row
  animate in place.
- **No cross-column drag without column-boundary detection** — the card
  will attach to a random column and confuse users.

---

## Checklist

- [ ] `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` installed
- [ ] `PointerSensor` has an activation constraint (distance or delay)
- [ ] `KeyboardSensor` present — accessibility
- [ ] Drag handles have `touch-none` to prevent mobile scroll conflict
- [ ] Optimistic update pattern with explicit rollback on API failure
- [ ] `arrayMove` used for local reorder (never mutate the array directly)
- [ ] Backend `reorder` service updates in `prisma.$transaction`
- [ ] `auditLogger.log` fires on reorder (per rule-backend.md)
- [ ] `AnimatePresence` for cards that fade out on delete
- [ ] Announcements configured for screen readers
- [ ] Dark-mode parity — no hardcoded colors
