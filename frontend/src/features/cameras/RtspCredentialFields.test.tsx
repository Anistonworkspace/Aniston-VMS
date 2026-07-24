import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RtspCredentialFields } from './RtspCredentialFields';
import type { RtspValue } from './cameraConfigForm';

const blank: RtspValue = {
  mainRtspUrl: '',
  subRtspUrl: '',
  rtspUsername: '',
  rtspPassword: '',
  onvifPort: '',
};

describe('RtspCredentialFields', () => {
  it('shows a "leave blank to keep" hint in edit mode', () => {
    render(<RtspCredentialFields value={blank} errors={{}} mode="edit" onChange={vi.fn()} />);
    expect(screen.getAllByText(/leave blank to keep/i).length).toBeGreaterThan(0);
  });

  it('does not show the keep-hint in create mode', () => {
    render(<RtspCredentialFields value={blank} errors={{}} mode="create" onChange={vi.fn()} />);
    expect(screen.queryByText(/leave blank to keep/i)).toBeNull();
  });

  it('emits a patch when the password is typed', () => {
    const onChange = vi.fn();
    render(<RtspCredentialFields value={blank} errors={{}} mode="edit" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/rtsp password/i), { target: { value: 'newpass' } });
    expect(onChange).toHaveBeenCalledWith({ rtspPassword: 'newpass' });
  });
});
