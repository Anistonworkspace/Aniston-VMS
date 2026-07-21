import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteCameraModal } from './DeleteCameraModal';
import type { Camera } from './cameras.types';

const camera = {
  id: 'cam-1',
  cameraCode: 'CAM-001',
  name: 'Front Door',
  site: { id: 'site-1', name: 'HQ' },
} as unknown as Camera;

function setup(overrides: Partial<React.ComponentProps<typeof DeleteCameraModal>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <DeleteCameraModal
      open
      camera={camera}
      loading={false}
      errorMessage={null}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />
  );
  return { onConfirm, onCancel };
}

describe('DeleteCameraModal', () => {
  it('shows the camera name, code, site and the preservation note', () => {
    setup();
    expect(screen.getByText('Front Door')).toBeInTheDocument();
    expect(screen.getByText(/CAM-001/)).toBeInTheDocument();
    expect(screen.getByText(/HQ/)).toBeInTheDocument();
    expect(screen.getByText(/never deletes historical incidents/i)).toBeInTheDocument();
  });

  it('calls onCancel and onConfirm from the buttons', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = setup();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /delete camera/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows "Deleting…" and disables both buttons while loading', () => {
    setup({ loading: true });
    expect(screen.getByRole('button', { name: /deleting/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });

  it('renders the error message and keeps the modal open', () => {
    setup({ errorMessage: 'This camera cannot be removed because it still has recorded history.' });
    expect(screen.getByRole('alert')).toHaveTextContent(/recorded history/i);
    expect(screen.getByText('Front Door')).toBeInTheDocument();
  });
});
