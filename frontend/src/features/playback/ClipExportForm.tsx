import { useState } from 'react';
import { Scissors, ShieldAlert } from 'lucide-react';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import type { SerializedError } from '@reduxjs/toolkit';
import { Button, Input } from '@/components/ui';
import { getApiErrorMessage } from '@/lib/apiError';
import { useToast } from '@/hooks/useToast';
import { useGetCurrentUserQuery } from '@/features/auth/auth.api';
import { isOperatorPlusRole } from '@/features/auth/auth.types';
import { useCreateClipExportMutation } from './clips.api';
import type { TimeRange } from './RecordingTimeline';

// Mirrors backend env.CLIP_EXPORT_MAX_DURATION_MINUTES default (see
// backend/src/config/env.ts). This is a client-side hint only — the server
// is the source of truth and will reject an over-long range regardless.
const CLIP_EXPORT_MAX_DURATION_MINUTES_DEFAULT = 60;

interface ClipExportFormProps {
  cameraId: string;
  range: TimeRange | null;
}

/** Requests a clip export for the currently selected timeline range (OPERATOR+ only). */
export function ClipExportForm({ cameraId, range }: ClipExportFormProps) {
  const { data: currentUser } = useGetCurrentUserQuery();
  const [incidentId, setIncidentId] = useState('');
  const [createClipExport, { isLoading }] = useCreateClipExportMutation();
  const toast = useToast();

  if (!isOperatorPlusRole(currentUser?.role)) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-hairline bg-surface px-4 py-3 text-sm text-muted">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        Monitoring Operator role or higher is required to export clips.
      </div>
    );
  }

  const durationMinutes = range
    ? (new Date(range.endAt).getTime() - new Date(range.startAt).getTime()) / 60_000
    : 0;
  const tooLong = durationMinutes > CLIP_EXPORT_MAX_DURATION_MINUTES_DEFAULT;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!range) return;
    try {
      await createClipExport({
        cameraId,
        body: {
          startAt: range.startAt,
          endAt: range.endAt,
          incidentId: incidentId.trim() || undefined,
        },
      }).unwrap();
      toast.success(
        'Clip export queued',
        'It will appear in the list below once processing completes.'
      );
      setIncidentId('');
    } catch (err) {
      toast.error(
        'Failed to queue clip export',
        getApiErrorMessage(err as FetchBaseQueryError | SerializedError)
      );
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-hairline bg-card p-4"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium text-ink">Export clip</p>
        {range ? (
          <p className="text-xs text-muted">
            {new Date(range.startAt).toLocaleString()} → {new Date(range.endAt).toLocaleString()} ·{' '}
            {durationMinutes.toFixed(1)} min
          </p>
        ) : (
          <p className="text-xs text-muted">Select a range on the timeline above first.</p>
        )}
        {tooLong && (
          <p className="text-xs font-medium text-coral">
            Range exceeds the {CLIP_EXPORT_MAX_DURATION_MINUTES_DEFAULT}-minute export limit.
          </p>
        )}
      </div>
      <Input
        label="Incident ID (optional)"
        placeholder="uuid…"
        value={incidentId}
        onChange={(e) => setIncidentId(e.target.value)}
        className="w-48"
      />
      <Button
        type="submit"
        leftIcon={<Scissors className="h-4 w-4" />}
        disabled={!range || tooLong}
        loading={isLoading}
      >
        Request export
      </Button>
    </form>
  );
}
