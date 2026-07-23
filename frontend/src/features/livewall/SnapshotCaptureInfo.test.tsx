import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { formatDateTime } from '@/lib/utils';
import { SnapshotCaptureInfo } from './SnapshotCaptureInfo';

const capturedAt = '2026-02-05T09:42:00.000Z';

function renderInfo(over: Partial<Parameters<typeof SnapshotCaptureInfo>[0]> = {}) {
  return render(
    <SnapshotCaptureInfo
      cameraName="Front Door"
      cameraCode="CAM-001"
      capturedAt={capturedAt}
      {...over}
    />
  );
}

describe('SnapshotCaptureInfo', () => {
  it('labels the strip as a screenshot caption', () => {
    renderInfo();
    expect(screen.getByText('Screenshot')).toBeInTheDocument();
  });

  it('shows the camera code and name so the source is unambiguous', () => {
    renderInfo();
    expect(screen.getByText('CAM-001')).toBeInTheDocument();
    expect(screen.getByText(/front door/i)).toBeInTheDocument();
  });

  it('renders the capture instant as an absolute local time inside a <time>', () => {
    const { container } = renderInfo();
    const time = container.querySelector('time');
    expect(time).not.toBeNull();
    // Anchored to the exact instant for machine/AT consumers…
    expect(time).toHaveAttribute('dateTime', capturedAt);
    // …and shown to humans as an absolute date/time, never "5 min ago".
    expect(time).toHaveTextContent(formatDateTime(capturedAt));
  });
});
