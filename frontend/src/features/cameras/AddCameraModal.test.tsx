import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// vi.mock factories are hoisted above these declarations, so anything they
// reference must live in vi.hoisted() (otherwise: TDZ "cannot access before
// initialization"). register() returns an object with .unwrap() to mirror the
// RTK Query mutation trigger the modal awaits.
const h = vi.hoisted(() => ({
  register: vi.fn((_body: unknown) => ({
    unwrap: () => Promise.resolve({ id: 'cam-9', cameraCode: 'CAM-GGN-021', name: 'Dock 3 entry' }),
  })),
  isLoading: false,
}));

vi.mock('./cameras.api', () => ({
  useRegisterCameraMutation: () => [h.register, { isLoading: h.isLoading }],
}));

import { AddCameraModal } from './AddCameraModal';

function setup(overrides: Partial<React.ComponentProps<typeof AddCameraModal>> = {}) {
  const onClose = vi.fn();
  const notify = { success: vi.fn(), error: vi.fn() };
  render(<AddCameraModal open onClose={onClose} notify={notify} {...overrides} />);
  return { onClose, notify };
}

function fill(label: RegExp, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.isLoading = false;
  h.register.mockReturnValue({
    unwrap: () => Promise.resolve({ id: 'cam-9', cameraCode: 'CAM-GGN-021', name: 'Dock 3 entry' }),
  });
});

describe('AddCameraModal — identity-only registration', () => {
  it('renders only identity fields', () => {
    setup();
    expect(screen.getByLabelText(/camera code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/brand/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/model/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/firmware/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/serial number/i)).toBeInTheDocument();
  });

  it('does NOT render any configuration fields (those move to step 2)', () => {
    setup();
    expect(screen.queryByLabelText(/site/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/router/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/rtsp/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/latitude/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/longitude/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/codec/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /test connection/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/draft/i)).toBeInTheDocument(); // draft hint IS shown
  });

  it('keeps "Add camera" disabled until both code and name are filled', () => {
    setup();
    const submit = screen.getByRole('button', { name: /add camera/i });
    expect(submit).toBeDisabled();
    fill(/camera code/i, 'CAM-GGN-021');
    expect(submit).toBeDisabled();
    fill(/^name/i, 'Dock 3 entry');
    expect(submit).toBeEnabled();
  });

  it('trims identity, omits empty optionals, and notifies + closes on success', async () => {
    const { onClose, notify } = setup();
    fill(/camera code/i, '  CAM-GGN-021  ');
    fill(/^name/i, '  Dock 3 entry ');
    fireEvent.click(screen.getByRole('button', { name: /add camera/i }));

    await waitFor(() => expect(h.register).toHaveBeenCalledTimes(1));
    expect(h.register).toHaveBeenCalledWith({
      cameraCode: 'CAM-GGN-021',
      name: 'Dock 3 entry',
      brand: undefined,
      model: undefined,
      firmware: undefined,
      serialNumber: undefined,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(notify.success).toHaveBeenCalledWith(
      'Camera registered',
      expect.stringMatching(/draft/i)
    );
    expect(notify.error).not.toHaveBeenCalled();
  });

  it('sends optional hardware fields when provided', async () => {
    setup();
    fill(/camera code/i, 'CAM-GGN-021');
    fill(/^name/i, 'Dock 3 entry');
    fill(/brand/i, ' Hikvision ');
    fill(/model/i, 'DS-2CD2043');
    fill(/firmware/i, 'V5.7.3');
    fill(/serial number/i, 'DS2CD-0451-A93');
    fireEvent.click(screen.getByRole('button', { name: /add camera/i }));

    await waitFor(() => expect(h.register).toHaveBeenCalledTimes(1));
    expect(h.register).toHaveBeenCalledWith({
      cameraCode: 'CAM-GGN-021',
      name: 'Dock 3 entry',
      brand: 'Hikvision',
      model: 'DS-2CD2043',
      firmware: 'V5.7.3',
      serialNumber: 'DS2CD-0451-A93',
    });
  });

  it('reports the backend error and keeps the modal open', async () => {
    const { onClose, notify } = setup();
    h.register.mockReturnValueOnce({
      unwrap: () =>
        Promise.reject({
          status: 409,
          data: { success: false, error: { code: 'CONFLICT', message: 'Camera code already exists' } },
        }),
    });
    fill(/camera code/i, 'CAM-GGN-021');
    fill(/^name/i, 'Dock 3 entry');
    fireEvent.click(screen.getByRole('button', { name: /add camera/i }));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Registration failed', 'Camera code already exists')
    );
    expect(notify.success).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows a loading, disabled submit while the mutation is in flight', () => {
    h.isLoading = true;
    setup();
    fill(/camera code/i, 'CAM-GGN-021');
    fill(/^name/i, 'Dock 3 entry');
    expect(screen.getByRole('button', { name: /add camera/i })).toBeDisabled();
  });
});
