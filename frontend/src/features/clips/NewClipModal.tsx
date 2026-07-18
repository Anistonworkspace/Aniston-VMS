import { useState } from 'react';
import type { SerializedError } from '@reduxjs/toolkit';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import { AnimatedModal, Button, Input } from '@/components/ui';
import { Select } from '@/features/reports/Select';
import type { SelectOption } from '@/features/reports/Select';
import type { CameraHealthRow } from '@/features/analytics/analytics.types';
import { getApiErrorMessage } from '@/lib/apiError';
import { useCreateClipMutation } from './clips.api';
import { CLIP_MAX_DURATION_MINUTES } from './clips.types';

interface NewClipModalProps {
  open: boolean;
  onClose: () => void;
  cameras: CameraHealthRow[];
  notify: {
    success: (title: string, description?: string) => void;
    error: (title: string, description?: string) => void;
  };
}

export function NewClipModal({ open, onClose, cameras, notify }: NewClipModalProps): JSX.Element {
  const [cameraId, setCameraId] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [createClip, { isLoading }] = useCreateClipMutation();

  const cameraOptions: SelectOption[] = cameras.map((camera) => ({
    value: camera.id,
    label: `${camera.name} (${camera.cameraCode})`,
  }));

  function validate(): string | null {
    if (!cameraId) return 'Choose a camera.';
    if (!startAt || !endAt) return 'Set both a start and an end time.';
    const start = Date.parse(startAt);
    const end = Date.parse(endAt);
    if (Number.isNaN(start) || Number.isNaN(end)) return 'One of the times is not a valid date.';
    if (end <= start) return 'The end time must be after the start time.';
    if (end - start > CLIP_MAX_DURATION_MINUTES * 60_000) {
      return `Clips are capped at ${CLIP_MAX_DURATION_MINUTES} minutes.`;
    }
    return null;
  }

  function reset(): void {
    setCameraId('');
    setStartAt('');
    setEndAt('');
    setFormError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError(null);
    try {
      await createClip({
        cameraId,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
      }).unwrap();
      notify.success(
        'Clip export queued',
        'Processing starts shortly — the list updates automatically.'
      );
      reset();
      onClose();
    } catch (err) {
      notify.error(
        'Could not queue clip',
        getApiErrorMessage(err as FetchBaseQueryError | SerializedError)
      );
    }
  }

  return (
    <AnimatedModal
      open={open}
      onClose={onClose}
      title="New clip export"
      description="Pick a camera and a recorded-footage window to export as a clip."
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <Select
          label="Camera"
          value={cameraId}
          onValueChange={setCameraId}
          options={cameraOptions}
          placeholder="Select a camera…"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Start"
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            required
          />
          <Input
            label="End"
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            required
          />
        </div>
        {formError && <p className="text-xs text-red-500">{formError}</p>}
        <p className="text-xs text-gray-500">
          Windows are capped at {CLIP_MAX_DURATION_MINUTES} minutes (server-configured) and must
          cover footage that has already been recorded.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={isLoading}>
            Queue export
          </Button>
        </div>
      </form>
    </AnimatedModal>
  );
}
