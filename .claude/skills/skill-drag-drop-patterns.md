# Skill — Drag & Drop Patterns (dnd-kit)

Sortable Live Wall tiles, incident kanban board, evidence-photo drop zones, multi-select camera drag. Uses `@dnd-kit/core` + `@dnd-kit/sortable` — accessibility-first (keyboard support built in) and mobile-friendly.

Design tokens: see `docs/04-uiux-brief.md`.

Prereqs:

```
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

---

## Sortable list — reorder `LiveWallGrid` tiles

```tsx
// frontend/src/features/live-wall/LiveWallGrid.tsx
import { useState } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useReorderWallTilesMutation } from './liveWallApi';
import { VideoTile } from '@/components/VideoTile';

export function LiveWallGrid({ tiles: initialTiles, wallId }: { tiles: WallTile[]; wallId: string }) {
  const [tiles, setTiles] = useState(initialTiles);
  const [reorderWallTiles] = useReorderWallTilesMutation();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const oldIndex = tiles.findIndex((t) => t.cameraId === active.id);
    const newIndex = tiles.findIndex((t) => t.cameraId === over.id);
    const reordered = arrayMove(tiles, oldIndex, newIndex);
    setTiles(reordered); // optimistic — the 2x2 / 3x2 grid must never flash on drop

    try {
      await reorderWallTiles({ wallId, tileIds: reordered.map((t) => t.cameraId) }).unwrap();
    } catch {
      setTiles(tiles); // rollback on failure
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={tiles.map((t) => t.cameraId)} strategy={verticalListSortingStrategy}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {tiles.map((t) => <SortableVideoTile key={t.cameraId} tile={t} />)}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableVideoTile({ tile }: { tile: WallTile }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tile.cameraId });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes} {...listeners}
      className={`rounded-[var(--card-radius)] overflow-hidden border border-[var(--hairline)] ${isDragging ? 'opacity-50 ring-2 ring-[var(--primary-color)]' : ''}`}
    >
      <VideoTile cameraId={tile.cameraId} label={tile.cameraCode} status={tile.status} />
    </div>
  );
}
```

```ts
// frontend/src/features/live-wall/liveWallApi.ts
reorderWallTiles: builder.mutation<void, { wallId: string; tileIds: string[] }>({
  query: ({ wallId, tileIds }) => ({ url: `/walls/${wallId}/reorder`, method: 'POST', body: { tileIds } }),
  async onQueryStarted({ wallId }, { dispatch, queryFulfilled }) {
    try { await queryFulfilled; }
    catch { dispatch(liveWallApi.util.invalidateTags([{ type: 'Wall', id: wallId }])); }
  },
}),
```

The reorder mutation writes a `WALL_LAYOUT_UPDATED` audit entry — layout changes are low-risk but still traceable (who moved `CAM-042` to tile 1, and when).

## Kanban board — `IncidentKanban`

```tsx
// frontend/src/features/incidents/IncidentKanban.tsx
import { DndContext, closestCenter, DragOverlay, type DragStartEvent, type DragEndEvent } from '@dnd-kit/core';

const COLUMNS: { id: IncidentStatus; label: string }[] = [
  { id: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { id: 'ASSIGNED', label: 'Assigned' },
  { id: 'INVESTIGATING', label: 'Investigating' },
  { id: 'RESOLVED', label: 'Resolved' },
];

export function IncidentKanban({ incidents }: { incidents: Incident[] }) {
  const [items, setItems] = useState(incidents);
  const [active, setActive] = useState<Incident | null>(null);
  const [updateIncidentStatus] = useUpdateIncidentStatusMutation();

  function onDragStart(e: DragStartEvent) {
    setActive(items.find((i) => i.id === e.active.id) ?? null);
  }

  async function onDragEnd(e: DragEndEvent) {
    setActive(null);
    const { active: a, over } = e;
    if (!over) return;
    const targetCol = over.data.current?.columnId as IncidentStatus | undefined;
    if (!targetCol) return;

    const incident = items.find((i) => i.id === a.id);
    if (!incident || incident.status === targetCol) return;

    setItems((prev) => prev.map((i) => (i.id === a.id ? { ...i, status: targetCol } : i)));
    try {
      await updateIncidentStatus({ id: incident.id, status: targetCol }).unwrap();
    } catch {
      setItems(items); // rollback — a bad status change here can wrongly pause/resume escalation timers
    }
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="grid grid-cols-4 gap-4">
        {COLUMNS.map((col) => (
          <KanbanColumn key={col.id} column={col} incidents={items.filter((i) => i.status === col.id)} />
        ))}
      </div>
      <DragOverlay>{active && <IncidentCard incident={active} />}</DragOverlay>
    </DndContext>
  );
}
```

Dragging an incident card between columns is a **status transition**, not a free-form label move — it must call the same `updateIncidentStatus` mutation the detail page uses, so state-machine guards (e.g. can't drag `Detected` straight to `Resolved` without an assignee, per `docs/03-app-flow.md` §3) apply identically. Reject the drop (snap back + toast) if the transition is invalid rather than allowing an illegal state to persist.

## File drop zone — attach evidence photo to an incident

```tsx
// frontend/src/features/incidents/EvidencePhotoDropzone.tsx
import { useDropzone } from 'react-dropzone';
import { useUploadEvidencePhotoMutation } from './incidentApi';

export function EvidencePhotoDropzone({ incidentId, onUploaded }: { incidentId: string; onUploaded: (photo: EvidencePhoto) => void }) {
  const [uploadEvidencePhoto] = useUploadEvidencePhotoMutation();

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    maxSize: 8 * 1024 * 1024,
    onDrop: async (files) => {
      for (const file of files) {
        const photo = await uploadEvidencePhoto({ incidentId, file }).unwrap();
        onUploaded(photo);
      }
    },
  });

  return (
    <div
      {...getRootProps()}
      className={`rounded-[var(--radius-medium)] border-2 border-dashed p-8 text-center transition-colors
        ${isDragActive ? 'border-[var(--primary-color)] bg-[var(--base-tint)]' : 'border-[var(--hairline)]'}`}
    >
      <input {...getInputProps()} />
      <p className="text-sm text-[var(--muted)]">
        {isDragActive ? 'Drop snapshot to attach' : 'Drag a snapshot here, or click to browse'}
      </p>
    </div>
  );
}
```

## Multi-select drag — move cameras to another zone

Shift-click / Ctrl-click builds `selectedIds`; dragging any selected tile moves the whole set. `SnapshotCompare` and "export clip" bulk actions reuse this same `selectedIds` set.

```tsx
function onDragStart(e: DragStartEvent) {
  const draggedIds = selectedIds.has(e.active.id as string) ? [...selectedIds] : [e.active.id as string];
  setDraggedIds(draggedIds);
}

function onDragEnd(e: DragEndEvent) {
  const { over } = e;
  if (!over) return setDraggedIds([]);
  const targetZoneId = over.id as string;
  moveCamerasToZone({ cameraIds: draggedIds, targetZoneId });
  setDraggedIds([]);
}
```

Moving cameras to a new zone updates dashboards, wall layouts, and reports immediately — but historical incidents keep their original `zoneId` (`docs/03-app-flow.md` §8). Show the impact ("N cameras, open incidents follow to the new zone") in a confirm step before committing the drop for cross-zone moves.

## Checklist

- [ ] `PointerSensor` has an `activationConstraint` (distance 8) so clicks on a `VideoTile`'s play/mute controls don't start a drag
- [ ] `KeyboardSensor` with `sortableKeyboardCoordinates` present on every sortable — arrow keys must reorder tiles/cards without a mouse
- [ ] Optimistic reorder + rollback on mutation failure — the wall/kanban never silently reverts without visual feedback
- [ ] Kanban drops go through the real `updateIncidentStatus` mutation, not a raw column-array `setState` — invalid transitions are rejected, not just relabeled
- [ ] `DragOverlay` renders the real card component (`IncidentCard`, `VideoTile`), never a plain ghost `<div>`
- [ ] File dropzone validates type + size client-side before upload; server re-validates regardless
- [ ] Layout/zone-move changes write an audit entry — matches `docs/03-app-flow.md` §8 requirement
- [ ] Mobile: drag handles are ≥44px touch targets; `touch-action: none` on drag handles to prevent scroll hijack
