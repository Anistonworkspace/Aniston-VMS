import { AlertTriangle } from 'lucide-react';
import { AnimatedModal, Button } from '@/components/ui';
import type { Camera } from './cameras.types';

export interface DeleteCameraModalProps {
  open: boolean;
  camera: Camera | null;
  loading: boolean;
  errorMessage: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteCameraModal({
  open,
  camera,
  loading,
  errorMessage,
  onConfirm,
  onCancel,
}: DeleteCameraModalProps): JSX.Element {
  return (
    <AnimatedModal
      open={open}
      // Block Escape / backdrop close mid-delete so we never orphan the request.
      onClose={loading ? () => undefined : onCancel}
      size="sm"
      title="Remove camera?"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-tile bg-coral/10 text-coral">
            <AlertTriangle size={18} strokeWidth={1.75} />
          </span>
          <div className="min-w-0 text-sm">
            <p className="text-secondary">Are you sure you want to remove this camera?</p>
            {camera && (
              <p className="mt-2 font-medium text-ink">
                {camera.name}
                <span className="ml-1 font-normal text-tertiary">
                  · {camera.cameraCode}
                  {camera.site ? ` · ${camera.site.name}` : ''}
                </span>
              </p>
            )}
          </div>
        </div>

        <p className="rounded-tile bg-surface px-3 py-2.5 text-xs leading-relaxed text-tertiary">
          Deleting a camera removes it permanently. Its historical incidents, recordings, snapshots,
          and health records are retained and stay accessible as belonging to a deleted camera.
        </p>

        {errorMessage && (
          <p
            role="alert"
            className="rounded-tile bg-coral/10 px-3 py-2 text-xs font-medium text-coral"
          >
            {errorMessage}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={onConfirm}
            loading={loading}
            disabled={loading}
          >
            {loading ? 'Deleting…' : 'Delete camera'}
          </Button>
        </div>
      </div>
    </AnimatedModal>
  );
}
