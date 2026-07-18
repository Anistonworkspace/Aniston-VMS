import { useEffect, useMemo, useState } from 'react';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import { Bookmark, Save, Trash2, VideoOff, X } from 'lucide-react';
import { Button, Input, ToastContainer } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { useListCamerasQuery } from '@/features/cameras/cameras.api';
import { getApiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/utils';
import { LiveTile } from './LiveTile';
import {
  ALL_KINDS,
  KIND_GRID_CLASS,
  KIND_LABEL,
  LAYOUT_MAX_CAMERAS,
  WALL_STORAGE_KEY,
} from './livewall.constants';
import {
  useCreateSavedLayoutMutation,
  useDeleteSavedLayoutMutation,
  useListSavedLayoutsQuery,
  useUpdateSavedLayoutMutation,
} from './livewall.api';
import type { LayoutKind } from './livewall.types';

const selectClass =
  'h-9 rounded-lg border border-gray-200 bg-white/70 px-3 text-sm text-gray-900 backdrop-blur-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500';

function readStoredWall(): { kind: LayoutKind; cameraIds: string[] } | null {
  try {
    const raw = localStorage.getItem(WALL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { kind?: unknown; cameraIds?: unknown };
    if (
      typeof parsed.kind === 'string' &&
      (ALL_KINDS as readonly string[]).includes(parsed.kind) &&
      Array.isArray(parsed.cameraIds) &&
      parsed.cameraIds.every((id): id is string => typeof id === 'string')
    ) {
      const kind = parsed.kind as LayoutKind;
      return { kind, cameraIds: parsed.cameraIds.slice(0, LAYOUT_MAX_CAMERAS[kind]) };
    }
  } catch {
    // Corrupted storage — fall through to defaults.
  }
  return null;
}

export function LiveWallPage(): JSX.Element {
  const { toasts, dismiss, success, error: notifyError } = useToast();

  const [kind, setKind] = useState<LayoutKind>(() => readStoredWall()?.kind ?? 'L2x2');
  const [cameraIds, setCameraIds] = useState<string[]>(() => readStoredWall()?.cameraIds ?? []);
  const [loadedLayoutId, setLoadedLayoutId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  // 100 = safe page size for the picker; walls reference at most 6 cameras.
  const { data: cameras, isLoading: camerasLoading } = useListCamerasQuery({ page: 1, limit: 100 });
  const { data: layouts } = useListSavedLayoutsQuery();

  const [createLayout, { isLoading: creating }] = useCreateSavedLayoutMutation();
  const [updateLayout, { isLoading: updating }] = useUpdateSavedLayoutMutation();
  const [deleteLayout, { isLoading: deleting }] = useDeleteSavedLayoutMutation();

  useEffect(() => {
    localStorage.setItem(WALL_STORAGE_KEY, JSON.stringify({ kind, cameraIds }));
  }, [kind, cameraIds]);

  const capacity = LAYOUT_MAX_CAMERAS[kind];
  const cameraById = useMemo(
    () => new Map((cameras?.items ?? []).map((camera) => [camera.id, camera])),
    [cameras]
  );
  const available = useMemo(
    () => (cameras?.items ?? []).filter((camera) => !cameraIds.includes(camera.id)),
    [cameras, cameraIds]
  );
  const loadedLayout = layouts?.find((layout) => layout.id === loadedLayoutId) ?? null;

  function changeKind(next: LayoutKind): void {
    setKind(next);
    setCameraIds((ids) => ids.slice(0, LAYOUT_MAX_CAMERAS[next]));
  }

  function addCamera(id: string): void {
    setCameraIds((ids) => (ids.length >= capacity || ids.includes(id) ? ids : [...ids, id]));
  }

  function removeCamera(id: string): void {
    setCameraIds((ids) => ids.filter((existing) => existing !== id));
  }

  function loadLayout(id: string): void {
    const layout = layouts?.find((entry) => entry.id === id);
    if (!layout) {
      setLoadedLayoutId(null);
      return;
    }
    setKind(layout.kind);
    setCameraIds(layout.cameraIds.slice(0, LAYOUT_MAX_CAMERAS[layout.kind]));
    setLoadedLayoutId(layout.id);
  }

  async function handleCreate(): Promise<void> {
    const name = saveName.trim();
    if (!name || cameraIds.length === 0) return;
    try {
      const created = await createLayout({ name, kind, cameraIds }).unwrap();
      setLoadedLayoutId(created.id);
      setSaveOpen(false);
      setSaveName('');
      success('Layout saved', `“${created.name}” is available on any of your sessions.`);
    } catch (err) {
      notifyError('Save failed', getApiErrorMessage(err as FetchBaseQueryError));
    }
  }

  async function handleUpdate(): Promise<void> {
    if (!loadedLayoutId || cameraIds.length === 0) return;
    try {
      const updated = await updateLayout({
        id: loadedLayoutId,
        body: { kind, cameraIds },
      }).unwrap();
      success('Layout updated', `“${updated.name}” now matches the current wall.`);
    } catch (err) {
      notifyError('Update failed', getApiErrorMessage(err as FetchBaseQueryError));
    }
  }

  async function handleDelete(): Promise<void> {
    if (!loadedLayoutId) return;
    const name = loadedLayout?.name;
    try {
      await deleteLayout(loadedLayoutId).unwrap();
      setLoadedLayoutId(null);
      success('Layout deleted', name ? `“${name}” was removed.` : undefined);
    } catch (err) {
      notifyError('Delete failed', getApiErrorMessage(err as FetchBaseQueryError));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-ink">Live Wall</h1>
          <p className="mt-1 text-sm text-gray-500">
            {cameraIds.length} of {capacity} tiles · low-latency sub-streams · layouts are personal
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Grid kind */}
          <div
            className="flex rounded-control bg-charcoal/5 p-0.5"
            role="group"
            aria-label="Grid size"
          >
            {ALL_KINDS.map((entry) => (
              <button
                key={entry}
                type="button"
                onClick={() => changeKind(entry)}
                aria-pressed={kind === entry}
                className={cn(
                  'rounded-[10px] px-3 py-1.5 text-xs font-medium tabular-nums transition-colors',
                  kind === entry ? 'bg-card text-ink shadow-soft' : 'text-gray-500 hover:text-ink'
                )}
              >
                {KIND_LABEL[entry]}
              </button>
            ))}
          </div>

          {/* Add camera */}
          <select
            value=""
            onChange={(event) => event.target.value && addCamera(event.target.value)}
            disabled={camerasLoading || cameraIds.length >= capacity}
            aria-label="Add camera to wall"
            className={selectClass}
          >
            <option value="">
              {camerasLoading
                ? 'Loading cameras…'
                : cameraIds.length >= capacity
                  ? 'Wall is full'
                  : 'Add camera…'}
            </option>
            {available.map((camera) => (
              <option key={camera.id} value={camera.id}>
                {camera.cameraCode} · {camera.name}
              </option>
            ))}
          </select>

          {/* Saved layouts */}
          <select
            value={loadedLayoutId ?? ''}
            onChange={(event) => loadLayout(event.target.value)}
            aria-label="Load saved layout"
            className={selectClass}
          >
            <option value="">My layouts…</option>
            {(layouts ?? []).map((layout) => (
              <option key={layout.id} value={layout.id}>
                {layout.name} ({KIND_LABEL[layout.kind]})
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Bookmark size={14} />}
            disabled={cameraIds.length === 0}
            onClick={() => setSaveOpen((open) => !open)}
          >
            Save as…
          </Button>
          {loadedLayoutId && (
            <>
              <Button
                variant="secondary"
                size="sm"
                loading={updating}
                disabled={cameraIds.length === 0}
                leftIcon={<Save size={14} />}
                onClick={handleUpdate}
              >
                Update
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={deleting}
                leftIcon={<Trash2 size={14} />}
                onClick={handleDelete}
              >
                Delete
              </Button>
            </>
          )}
          {cameraIds.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<X size={14} />}
              onClick={() => setCameraIds([])}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Save-as inline form */}
      {saveOpen && (
        <div className="flex max-w-md items-end gap-2 rounded-tile bg-card p-3 shadow-soft">
          <Input
            label="Layout name"
            value={saveName}
            onChange={(event) => setSaveName(event.target.value)}
            placeholder="e.g. Night shift — north gates"
          />
          <Button size="sm" loading={creating} disabled={!saveName.trim()} onClick={handleCreate}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSaveOpen(false)}>
            Cancel
          </Button>
        </div>
      )}

      {/* The wall */}
      {cameraIds.length === 0 ? (
        <div className="rounded-card bg-card p-12 text-center shadow-soft">
          <VideoOff size={22} strokeWidth={1.5} className="mx-auto text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">
            The wall is empty — add cameras with the picker above, or load one of your saved
            layouts.
          </p>
        </div>
      ) : (
        <div className={cn('grid gap-3', KIND_GRID_CLASS[kind])}>
          {cameraIds.map((id) => {
            const camera = cameraById.get(id);
            return camera ? (
              <LiveTile key={id} camera={camera} onRemove={() => removeCamera(id)} />
            ) : (
              <div
                key={id}
                className="relative grid aspect-video place-items-center rounded-tile bg-charcoal/10"
              >
                <p className="text-xs text-gray-400">
                  {camerasLoading ? 'Loading…' : 'Camera unavailable'}
                </p>
                <button
                  type="button"
                  onClick={() => removeCamera(id)}
                  aria-label="Remove unavailable camera"
                  className="absolute right-2 top-2 rounded-full bg-black/10 p-1 text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
          {Array.from({ length: Math.max(0, capacity - cameraIds.length) }).map((_, index) => (
            <div
              key={`empty-${index}`}
              className="grid aspect-video place-items-center rounded-tile border border-dashed border-gray-200"
            >
              <p className="text-xs text-gray-300">Empty slot</p>
            </div>
          ))}
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
