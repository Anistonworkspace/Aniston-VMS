import { useState } from 'react';
import type { ChangeEvent } from 'react';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { AnimatedModal, Button, Input } from '@/components/ui';
import { getApiErrorMessage } from '@/lib/apiError';
import { useRegisterCameraMutation } from './cameras.api';

interface AddCameraModalProps {
  open: boolean;
  onClose: () => void;
  notify: {
    success: (title: string, description?: string) => void;
    error: (title: string, description?: string) => void;
  };
}

// Step 1 of the split workflow — IDENTITY ONLY. Mirrors backend
// registerCameraSchema: a physical camera is added to inventory with just its
// identity and is born DRAFT. Site, router, map position, network and RTSP
// stream config are supplied later via ConfigureCameraModal, so this form
// deliberately carries none of those fields.
interface FormState {
  cameraCode: string;
  name: string;
  brand: string;
  model: string;
  firmware: string;
  serialNumber: string;
}

const INITIAL_FORM: FormState = {
  cameraCode: '',
  name: '',
  brand: '',
  model: '',
  firmware: '',
  serialNumber: '',
};

/**
 * Register a physical camera in inventory using identity only (code + name, plus
 * optional make/model/firmware/serial). The camera is created DRAFT: it is not
 * placed, wired or streamable until it is configured and activated from its
 * card. Deliberately carries NO site, router, RTSP, codec or map fields — those
 * belong to ConfigureCameraModal (step 2).
 */
export function AddCameraModal({ open, onClose, notify }: AddCameraModalProps): JSX.Element {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [registerCamera, { isLoading: isRegistering }] = useRegisterCameraMutation();

  const set =
    (key: keyof FormState) =>
    (event: ChangeEvent<HTMLInputElement>): void =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  // Code + name are the only required identity fields; everything else is an
  // optional hardware detail.
  const requiredReady = form.cameraCode.trim() !== '' && form.name.trim() !== '';

  const close = (): void => {
    setForm(INITIAL_FORM);
    onClose();
  };

  const handleSubmit = async (): Promise<void> => {
    if (!requiredReady) return;
    try {
      const created = await registerCamera({
        cameraCode: form.cameraCode.trim(),
        name: form.name.trim(),
        brand: form.brand.trim() || undefined,
        model: form.model.trim() || undefined,
        firmware: form.firmware.trim() || undefined,
        serialNumber: form.serialNumber.trim() || undefined,
      }).unwrap();
      notify.success(
        'Camera registered',
        `${created.name} (${created.cameraCode}) added as a draft — configure it to start streaming.`
      );
      close();
    } catch (err) {
      notify.error('Registration failed', getApiErrorMessage(err as FetchBaseQueryError));
    }
  };

  return (
    <AnimatedModal
      open={open}
      onClose={close}
      title="Add camera"
      description="Register a camera in inventory with its identity. You'll place and configure it next."
      size="md"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Camera code *"
            placeholder="CAM-GGN-021"
            value={form.cameraCode}
            onChange={set('cameraCode')}
          />
          <Input
            label="Name *"
            placeholder="Dock 3 entry"
            value={form.name}
            onChange={set('name')}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Brand"
            placeholder="Hikvision"
            value={form.brand}
            onChange={set('brand')}
          />
          <Input
            label="Model"
            placeholder="DS-2CD2043"
            value={form.model}
            onChange={set('model')}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Firmware"
            placeholder="V5.7.3"
            value={form.firmware}
            onChange={set('firmware')}
          />
          <Input
            label="Serial number"
            placeholder="DS2CD-0451-A93"
            value={form.serialNumber}
            onChange={set('serialNumber')}
          />
        </div>

        <p className="text-xs text-muted">
          The camera is added as a{' '}
          <span className="font-medium text-secondary">draft</span>. Site, router, map position,
          network and stream settings are supplied when you configure it.
        </p>

        <div className="flex items-center justify-end gap-2 border-t border-hairline pt-4">
          <Button variant="ghost" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!requiredReady || isRegistering}
            loading={isRegistering}
            onClick={() => void handleSubmit()}
          >
            Add camera
          </Button>
        </div>
      </div>
    </AnimatedModal>
  );
}
