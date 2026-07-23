import { MousePointerClick } from 'lucide-react';
import { AnimatedModal, Button } from '@/components/ui';

export interface SelectCameraModalProps {
  open: boolean;
  /** Close the modal without entering selection mode. */
  onCancel: () => void;
  /** Close the modal and activate camera-selection mode. */
  onContinue: () => void;
}

/**
 * Intro prompt shown when an admin clicks "Delete camera". Confirming with
 * "Continue" activates the card selection mode; "Cancel" (and Escape/backdrop)
 * simply closes without changing anything.
 */
export function SelectCameraModal({
  open,
  onCancel,
  onContinue,
}: SelectCameraModalProps): JSX.Element {
  return (
    <AnimatedModal open={open} onClose={onCancel} size="sm" title="Select a camera">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-tile bg-sage/10 text-sage">
            <MousePointerClick size={18} strokeWidth={1.75} />
          </span>
          <p className="min-w-0 text-sm text-secondary">Choose the camera you want to remove.</p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={onContinue}>
            Continue
          </Button>
        </div>
      </div>
    </AnimatedModal>
  );
}
