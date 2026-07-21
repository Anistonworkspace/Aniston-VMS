import { useState } from 'react';
import { Radio, Rewind, Video } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { cn } from '@/lib/utils';
import { CameraPicker } from './CameraPicker';
import { RecordingTimeline, type TimeRange } from './RecordingTimeline';
import { StreamStage } from './StreamStage';
import { ClipExportForm } from './ClipExportForm';
import { ClipList } from './ClipList';
import type { CameraLite, RecordingTrack, StreamKind } from './playback.types';

type ViewMode = 'live' | 'playback';

// Playback & Clips ("/playback") — live view of a camera's MAIN/SUB stream,
// browse its recorded segment timeline for a chosen day, scrub a range to
// switch into playback, and request a clip export for that range. See
// backend/src/modules/playback/** + clips/** for the real contracts this
// feature composes (StreamSession lifecycle, RecordingSegment listing,
// ClipExport request/poll).
export function PlaybackPage(): JSX.Element {
  const [camera, setCamera] = useState<CameraLite | null>(null);
  const [mode, setMode] = useState<ViewMode>('live');
  const [track, setTrack] = useState<RecordingTrack>('MAIN');
  const [selection, setSelection] = useState<TimeRange | null>(null);

  function handleSelectionChange(range: TimeRange | null) {
    setSelection(range);
    if (range) setMode('playback');
  }

  const kind: StreamKind =
    mode === 'playback' ? 'PLAYBACK' : track === 'MAIN' ? 'LIVE_MAIN' : 'LIVE_SUB';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-ink">Playback &amp; Clips</h1>
          <p className="mt-0.5 text-sm text-muted">
            Watch a camera live, scrub its recorded history, and export clips for the record.
          </p>
        </div>
        <CameraPicker value={camera} onChange={setCamera} />
      </div>

      {!camera ? (
        <Card className="flex flex-col items-center gap-2 py-16 text-center text-muted">
          <Video className="h-8 w-8" />
          <p className="text-sm">
            Select a camera above to start watching or browse its recordings.
          </p>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>
                  {camera.cameraCode} · {camera.name}
                </CardTitle>
                <CardDescription>
                  {mode === 'playback' ? 'Playback of a selected recorded range' : 'Live stream'}
                </CardDescription>
              </div>
              <div className="inline-flex rounded-lg border border-hairline bg-card p-0.5 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setMode('live');
                    setSelection(null);
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors',
                    mode === 'live' ? 'bg-indigo text-white' : 'text-muted hover:bg-surface'
                  )}
                >
                  <Radio className="h-3.5 w-3.5" />
                  Live
                </button>
                <button
                  type="button"
                  disabled={!selection}
                  onClick={() => setMode('playback')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                    mode === 'playback'
                      ? 'bg-indigo text-white'
                      : 'text-muted hover:bg-surface'
                  )}
                >
                  <Rewind className="h-3.5 w-3.5" />
                  Playback
                </button>
              </div>
            </CardHeader>
            <StreamStage
              camera={camera}
              kind={kind}
              playbackRange={mode === 'playback' ? selection : null}
            />
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Recording timeline</CardTitle>
                <CardDescription>
                  Drag across the bar to select a range for playback or clip export.
                </CardDescription>
              </div>
            </CardHeader>
            <RecordingTimeline
              cameraId={camera.id}
              track={track}
              onTrackChange={setTrack}
              selection={selection}
              onSelectionChange={handleSelectionChange}
            />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Clip exports</CardTitle>
            </CardHeader>
            <div className="space-y-4">
              <ClipExportForm cameraId={camera.id} range={selection} />
              <ClipList cameraId={camera.id} />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
