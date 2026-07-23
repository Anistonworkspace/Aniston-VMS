import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import { Bookmark, Save, Trash2, VideoOff, X } from 'lucide-react';
import { Button, Input, SegmentedControl, ToastContainer } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { useListCamerasQuery } from '@/features/cameras/cameras.api';
import { useListZoneSummariesQuery } from '@/features/overview/overview.api';
import { CameraStatusBadge } from '@/features/cameras/CameraStatusBadge';
import { getApiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/utils';
import { WallTile } from './WallTile';
import { useCameraViewMode, type CameraViewMode } from './useCameraViewMode';
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
  'h-9 rounded-lg border border-hairline bg-card px-3 text-sm text-ink focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage';

/** Wall view: `focus` = one big player + side list (YouTube-style), `grid` = classic tiles. */
type WallView = 'focus' | 'grid';

/** Focus view fits one big player + up to 5 side tiles (same cap as the 3×2 grid). */
const FOCUS_MAX_CAMERAS = LAYOUT_MAX_CAMERAS.L3x2;

function readStoredWall(): {
  kind: LayoutKind;
  cameraIds: string[];
  view: WallView;
  focusedId: string | null;
} | null {
  try {
    const raw = localStorage.getItem(WALL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      kind?: unknown;
      cameraIds?: unknown;
      view?: unknown;
      focusedId?: unknown;
    };
    if (
      typeof parsed.kind === 'string' &&
      (ALL_KINDS as readonly string[]).includes(parsed.kind) &&
      Array.isArray(parsed.cameraIds) &&
      parsed.cameraIds.every((id): id is string => typeof id === 'string')
    ) {
      const kind = parsed.kind as LayoutKind;
      const view: WallView = parsed.view === 'grid' ? 'grid' : 'focus';
      const max = view === 'focus' ? FOCUS_MAX_CAMERAS : LAYOUT_MAX_CAMERAS[kind];
      return {
        kind,
        cameraIds: parsed.cameraIds.slice(0, max),
        view,
        focusedId: typeof parsed.focusedId === 'string' ? parsed.focusedId : null,
      };
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
  const [view, setView] = useState<WallView>(() => readStoredWall()?.view ?? 'focus');
  const [viewMode, setViewMode] = useCameraViewMode();
  const [focusedId, setFocusedId] = useState<string | null>(
    () => readStoredWall()?.focusedId ?? null
  );
  const [loadedLayoutId, setLoadedLayoutId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  const [searchParams, setSearchParams] = useSearchParams();
  const zoneId = searchParams.get('zone') ?? '';

  // 100 = safe page size for the picker; walls reference at most 6 cameras.
  // When a zone is requested (e.g. "Open in Live Wall" from a zone card) the
  // list is scoped to it — the backend ANDs the zone with the caller's RBAC
  // scope, so an out-of-scope "?zone=" yields zero cameras, never a leak.
  const { data: cameras, isLoading: camerasLoading } = useListCamerasQuery({
    page: 1,
    limit: 100,
    zoneId: zoneId || undefined,
  });
  const { data: layouts } = useListSavedLayoutsQuery();

  // Resolve the requested zone's name for the filter chip.
  const { data: zoneSummaries } = useListZoneSummariesQuery(undefined, { skip: !zoneId });
  const activeZoneName = useMemo(
    () => (zoneId ? (zoneSummaries?.find((zone) => zone.id === zoneId)?.name ?? null) : null),
    [zoneSummaries, zoneId]
  );

  // Clearing the zone chip drops "?zone=" from the URL.
  const clearZone = (): void => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete('zone');
        return params;
      },
      { replace: true }
    );
  };

  const [createLayout, { isLoading: creating }] = useCreateSavedLayoutMutation();
  const [updateLayout, { isLoading: updating }] = useUpdateSavedLayoutMutation();
  const [deleteLayout, { isLoading: deleting }] = useDeleteSavedLayoutMutation();

  useEffect(() => {
    localStorage.setItem(WALL_STORAGE_KEY, JSON.stringify({ kind, cameraIds, view, focusedId }));
  }, [kind, cameraIds, view, focusedId]);

  const capacity = view === 'focus' ? FOCUS_MAX_CAMERAS : LAYOUT_MAX_CAMERAS[kind];
  const cameraById = useMemo(
    () => new Map((cameras?.items ?? []).map((camera) => [camera.id, camera])),
    [cameras]
  );
  // Only CONFIGURED cameras have a stream to render — DRAFT (registered but not
  // yet placed/wired) cameras are never offered to the wall or auto-filled in.
  const streamable = useMemo(
    () => (cameras?.items ?? []).filter((camera) => camera.provisioningState === 'CONFIGURED'),
    [cameras]
  );
  const available = useMemo(
    () => streamable.filter((camera) => !cameraIds.includes(camera.id)),
    [streamable, cameraIds]
  );
  const loadedLayout = layouts?.find((layout) => layout.id === loadedLayoutId) ?? null;

  // Demo-friendly default: an empty wall auto-fills with the first cameras in
  // scope once they load (at most once per mount, so Clear stays respected).
  const autoFilledRef = useRef(false);
  useEffect(() => {
    if (autoFilledRef.current) return;
    const items = streamable;
    if (items.length === 0) return;
    autoFilledRef.current = true;
    const fill = items.slice(0, capacity).map((c) => c.id);
    // A specific zone was requested → show that zone's cameras, replacing any
    // restored wall. Otherwise keep a restored wall and only fill an empty one.
    setCameraIds((ids) => (zoneId ? fill : ids.length > 0 ? ids : fill));
  }, [streamable, capacity, zoneId]);

  // Focus view: the focused camera plays big; fall back to the first tile when
  // the focused one was removed (or never chosen).
  const mainId = focusedId && cameraIds.includes(focusedId) ? focusedId : (cameraIds[0] ?? null);
  const mainCamera = mainId ? cameraById.get(mainId) : undefined;
  const sideIds = cameraIds.filter((id) => id !== mainId);

  function changeKind(next: LayoutKind): void {
    setView('grid');
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
      <div className="space-y-3">
        {/* Header band: title/description on the left, the wall-wide view-mode
            toggle at the top-right (aligned with the heading; it wraps below the
            heading on narrow screens via flex-wrap). */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-semibold text-ink">Live Wall</h1>
            <p className="mt-1 text-sm text-muted">
              {cameraIds.length} of {capacity} cameras ·{' '}
              {view === 'focus' ? 'big player + side list' : 'tile grid'} · low-latency sub-streams
            </p>
            {zoneId && (
              <button
                type="button"
                onClick={clearZone}
                aria-label="Clear zone filter"
                className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-full bg-sage/15 px-3 text-xs font-medium text-sage transition-colors hover:bg-sage/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
              >
                <span className="truncate max-w-[12rem]">Zone: {activeZoneName ?? 'selected'}</span>
                <X size={13} />
              </button>
            )}
          </div>
          {/* Camera Stream / Screenshots view mode — wall-wide, persisted */}
          <SegmentedControl<CameraViewMode>
            value={viewMode}
            onChange={setViewMode}
            ariaLabel="Camera view mode"
            options={[
              { value: 'stream', label: 'Camera Stream' },
              { value: 'screenshots', label: 'Screenshots' },
            ]}
            className="shrink-0"
          />
        </div>

        {/* Wall controls — kept in their original order/positions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Grid kind */}
          <div
            className="flex rounded-control bg-charcoal/5 p-0.5"
            role="group"
            aria-label="Wall layout"
          >
            <button
              type="button"
              onClick={() => setView('focus')}
              aria-pressed={view === 'focus'}
              className={cn(
                'rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors',
                view === 'focus' ? 'bg-card text-ink shadow-soft' : 'text-muted hover:text-ink'
              )}
            >
              Focus
            </button>
            {ALL_KINDS.map((entry) => (
              <button
                key={entry}
                type="button"
                onClick={() => changeKind(entry)}
                aria-pressed={view === 'grid' && kind === entry}
                className={cn(
                  'rounded-[10px] px-3 py-1.5 text-xs font-medium tabular-nums transition-colors',
                  view === 'grid' && kind === entry
                    ? 'bg-card text-ink shadow-soft'
                    : 'text-muted hover:text-ink'
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
          <VideoOff size={22} strokeWidth={1.5} className="mx-auto text-muted" />
          <p className="mt-3 text-sm text-muted">
            The wall is empty — add cameras with the picker above, or load one of your saved
            layouts.
          </p>
        </div>
      ) : view === 'focus' ? (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          {/* Main player (theater view) */}
          <div className="min-w-0">
            {mainCamera ? (
              <WallTile
                key={mainCamera.id}
                camera={mainCamera}
                viewMode={viewMode}
                onRemove={() => removeCamera(mainCamera.id)}
              />
            ) : (
              <div className="grid aspect-video place-items-center rounded-tile bg-charcoal/10">
                <p className="text-xs text-muted">
                  {camerasLoading ? 'Loading…' : 'Camera unavailable'}
                </p>
              </div>
            )}
            {mainCamera && (
              <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate font-heading text-lg font-semibold text-ink">
                    {mainCamera.name}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">
                    <span className="tabular-nums">{mainCamera.cameraCode}</span>
                    {mainCamera.site?.name ? ` · ${mainCamera.site.name}` : ''} · Health{' '}
                    <span className="tabular-nums">{mainCamera.healthScore}</span>/100
                  </p>
                </div>
                <CameraStatusBadge status={mainCamera.status} />
              </div>
            )}
          </div>

          {/* Side list — click a tile (or its details) to play it in the main player. */}
          <aside className="flex min-w-0 flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              More cameras · {sideIds.length}
            </p>
            {sideIds.length === 0 && (
              <p className="text-xs text-muted">
                Add cameras with the picker above to build the side list.
              </p>
            )}
            {sideIds.map((id) => {
              const camera = cameraById.get(id);
              if (!camera) {
                return (
                  <div
                    key={id}
                    className="flex items-center justify-between gap-2 rounded-tile bg-charcoal/5 px-3 py-2"
                  >
                    <p className="text-xs text-muted">
                      {camerasLoading ? 'Loading…' : 'Camera unavailable'}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeCamera(id)}
                      aria-label="Remove unavailable camera"
                      className="rounded-full bg-charcoal/10 p-1 text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              }
              return (
                <div key={id} className="group flex items-start gap-3">
                  <div className="relative w-44 shrink-0">
                    <WallTile camera={camera} viewMode={viewMode} onRemove={() => removeCamera(id)} />
                    <button
                      type="button"
                      onClick={() => setFocusedId(id)}
                      aria-label={`Play ${camera.name} in the main player`}
                      className="absolute inset-0 z-10 rounded-tile transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setFocusedId(id)}
                    className="min-w-0 flex-1 pt-0.5 text-left focus-visible:outline-none"
                  >
                    <p className="truncate text-sm font-medium text-ink transition-colors group-hover:text-sage">
                      {camera.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      <span className="tabular-nums">{camera.cameraCode}</span>
                      {camera.site?.name ? ` · ${camera.site.name}` : ''}
                    </p>
                    <p className="mt-1 text-[11px] text-muted">
                      Health <span className="tabular-nums">{camera.healthScore}</span>/100
                    </p>
                    <CameraStatusBadge status={camera.status} className="mt-1.5" />
                  </button>
                </div>
              );
            })}
          </aside>
        </div>
      ) : (
        <div className={cn('grid gap-3', KIND_GRID_CLASS[kind])}>
          {cameraIds.map((id) => {
            const camera = cameraById.get(id);
            return camera ? (
              <WallTile key={id} camera={camera} viewMode={viewMode} onRemove={() => removeCamera(id)} />
            ) : (
              <div
                key={id}
                className="relative grid aspect-video place-items-center rounded-tile bg-charcoal/10"
              >
                <p className="text-xs text-muted">
                  {camerasLoading ? 'Loading…' : 'Camera unavailable'}
                </p>
                <button
                  type="button"
                  onClick={() => removeCamera(id)}
                  aria-label="Remove unavailable camera"
                  className="absolute right-2 top-2 rounded-full bg-charcoal/10 p-1 text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
          {Array.from({ length: Math.max(0, capacity - cameraIds.length) }).map((_, index) => (
            <div
              key={`empty-${index}`}
              className="grid aspect-video place-items-center rounded-tile border border-dashed border-hairline"
            >
              <p className="text-xs text-muted">Empty slot</p>
            </div>
          ))}
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
