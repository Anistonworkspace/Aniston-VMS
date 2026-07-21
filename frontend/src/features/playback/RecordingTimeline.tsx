import { useMemo, useRef, useState } from 'react';
import { addDays, endOfDay, format, isSameDay, startOfDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Film } from 'lucide-react';
import { Button, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/apiError';
import { useListRecordingSegmentsQuery } from './playback.api';
import type { RecordingSegment, RecordingTrack } from './playback.types';

export interface TimeRange {
  startAt: string;
  endAt: string;
}

interface RecordingTimelineProps {
  cameraId: string;
  track: RecordingTrack;
  onTrackChange: (track: RecordingTrack) => void;
  selection: TimeRange | null;
  onSelectionChange: (range: TimeRange | null) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function pct(ms: number, dayStart: number): number {
  return Math.min(100, Math.max(0, ((ms - dayStart) / DAY_MS) * 100));
}

/** Day-scoped recording segment timeline with click-drag range selection (for playback + clip export). */
export function RecordingTimeline({
  cameraId,
  track,
  onTrackChange,
  selection,
  onSelectionChange,
}: RecordingTimelineProps) {
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragStartX, setDragStartX] = useState<number | null>(null);

  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);

  const {
    data: segments,
    isLoading,
    isError,
    error,
  } = useListRecordingSegmentsQuery({
    cameraId,
    startAt: dayStart.toISOString(),
    endAt: dayEnd.toISOString(),
    track,
  });

  const isToday = isSameDay(day, new Date());

  function xToTime(clientX: number): Date {
    const el = trackRef.current;
    if (!el) return dayStart;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return new Date(dayStart.getTime() + ratio * DAY_MS);
  }

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    setDragStartX(e.clientX);
    const t = xToTime(e.clientX).toISOString();
    onSelectionChange({ startAt: t, endAt: t });
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (dragStartX === null) return;
    const from = xToTime(dragStartX);
    const to = xToTime(e.clientX);
    const [startAt, endAt] = from <= to ? [from, to] : [to, from];
    onSelectionChange({ startAt: startAt.toISOString(), endAt: endAt.toISOString() });
  }

  function handleMouseUp() {
    setDragStartX(null);
  }

  const hourMarks = useMemo(() => Array.from({ length: 25 }, (_, i) => i), []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDay((d) => addDays(d, -1))}
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[9rem] text-center text-sm font-medium text-ink">
            {format(day, 'EEE, dd MMM yyyy')}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDay((d) => addDays(d, 1))}
            disabled={isToday}
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isToday && (
            <Button variant="ghost" size="sm" onClick={() => setDay(startOfDay(new Date()))}>
              Today
            </Button>
          )}
        </div>
        <div className="inline-flex rounded-lg border border-hairline bg-card p-0.5 text-sm">
          {(['MAIN', 'SUB'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTrackChange(t)}
              className={cn(
                'rounded-md px-3 py-1 font-medium transition-colors',
                track === t ? 'bg-indigo text-white' : 'text-muted hover:bg-surface'
              )}
            >
              {t === 'MAIN' ? 'Main stream' : 'Sub stream'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Skeleton height={64} className="w-full rounded-xl" />
      ) : isError ? (
        <div className="rounded-xl border border-state-critical/30 bg-state-critical-soft px-4 py-6 text-center text-sm text-state-critical">
          {getApiErrorMessage(error)}
        </div>
      ) : (
        <div className="space-y-1">
          <div
            ref={trackRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="relative h-16 w-full cursor-crosshair select-none overflow-hidden rounded-xl border border-hairline bg-surface"
          >
            {segments && segments.length > 0 ? (
              segments.map((segment: RecordingSegment) => {
                const s = pct(new Date(segment.startAt).getTime(), dayStart.getTime());
                const e = pct(new Date(segment.endAt).getTime(), dayStart.getTime());
                return (
                  <div
                    key={segment.id}
                    title={`${format(new Date(segment.startAt), 'HH:mm:ss')} – ${format(new Date(segment.endAt), 'HH:mm:ss')}`}
                    className="absolute top-2 h-12 rounded-sm bg-sage/80"
                    style={{ left: `${s}%`, width: `${Math.max(0.3, e - s)}%` }}
                  />
                );
              })
            ) : (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-muted">
                <Film className="h-4 w-4" />
                No recordings for this day
              </div>
            )}
            {selection && (
              <div
                className="absolute top-0 h-full border-x-2 border-indigo bg-indigo/20"
                style={{
                  left: `${pct(new Date(selection.startAt).getTime(), dayStart.getTime())}%`,
                  width: `${Math.max(
                    0.2,
                    pct(new Date(selection.endAt).getTime(), dayStart.getTime()) -
                      pct(new Date(selection.startAt).getTime(), dayStart.getTime())
                  )}%`,
                }}
              />
            )}
          </div>
          <div className="flex justify-between px-0.5 text-[10px] text-muted">
            {hourMarks
              .filter((h) => h % 3 === 0)
              .map((h) => (
                <span key={h}>{String(h).padStart(2, '0')}:00</span>
              ))}
          </div>
        </div>
      )}

      {selection && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-indigo-soft px-3 py-2 text-sm text-indigo">
          <span>
            Selected: {format(new Date(selection.startAt), 'HH:mm:ss')} –{' '}
            {format(new Date(selection.endAt), 'HH:mm:ss')}
          </span>
          <Button variant="ghost" size="sm" onClick={() => onSelectionChange(null)}>
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
