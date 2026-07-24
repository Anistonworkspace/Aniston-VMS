import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StreamSpecFields } from './StreamSpecFields';
import type { StreamSpecValue } from './cameraConfigForm';

const value: StreamSpecValue = {
  playbackAdapter: 'ONVIF_G',
  expectedCodec: 'H.264',
  expectedResolution: '1920x1080',
  expectedFps: '15',
  expectedBitrateKbps: '2048',
};

describe('StreamSpecFields', () => {
  it('renders current values and emits a patch on edit', () => {
    const onChange = vi.fn();
    render(<StreamSpecFields value={value} errors={{}} onChange={onChange} />);
    expect(screen.getByLabelText(/codec/i)).toHaveValue('H.264');
    fireEvent.change(screen.getByLabelText(/frames per second|fps/i), { target: { value: '30' } });
    expect(onChange).toHaveBeenCalledWith({ expectedFps: '30' });
  });

  it('shows a field error', () => {
    render(
      <StreamSpecFields
        value={value}
        errors={{ expectedFps: 'FPS must be a whole number 1–240' }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText(/FPS must be a whole number/i)).toBeInTheDocument();
  });
});
