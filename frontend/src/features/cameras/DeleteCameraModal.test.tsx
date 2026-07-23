import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    // Copy now promises the delete succeeds and history is retained (not blocked).
    expect(
      screen.getByText(/removes it permanently.*retained and stay accessible/is)
    ).toBeInTheDocument();
  });

  it('calls onCancel and onConfirm from the buttons', () => {
    const { onConfirm, onCancel } = setup();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /delete camera/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows "Deleting…" and disables both buttons while loading', () => {
    setup({ loading: true });
    expect(screen.getByRole('button', { name: /deleting/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });

  it('renders a generic failure message and keeps the modal open', () => {
    // History no longer blocks deletion, so the only errors are transient
    // failures (network / server). The modal just surfaces whatever it is given.
    setup({ errorMessage: 'Something went wrong while removing the camera. Please try again.' });
    expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i);
    expect(screen.getByText('Front Door')).toBeInTheDocument();
  });
});
