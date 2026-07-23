import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SegmentedControl, type SegmentedOption } from './SegmentedControl';

type Mode = 'stream' | 'screenshots';

const options: SegmentedOption<Mode>[] = [
  { value: 'stream', label: 'Camera Stream' },
  { value: 'screenshots', label: 'Screenshots' },
];

/** Controlled harness so selection-follows-focus updates aria-checked for real. */
function Harness({
  initial = 'stream',
  onChange,
}: {
  initial?: Mode;
  onChange?: (m: Mode) => void;
}) {
  const [value, setValue] = useState<Mode>(initial);
  return (
    <SegmentedControl<Mode>
      value={value}
      onChange={(m) => {
        setValue(m);
        onChange?.(m);
      }}
      options={options}
      ariaLabel="Camera view mode"
    />
  );
}

describe('SegmentedControl', () => {
  it('exposes a labelled radiogroup with one radio per option', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'Camera view mode' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('marks the active option checked and uses a roving tabindex', () => {
    render(<Harness initial="stream" />);
    const stream = screen.getByRole('radio', { name: /camera stream/i });
    const shots = screen.getByRole('radio', { name: /screenshots/i });
    expect(stream).toBeChecked();
    expect(shots).not.toBeChecked();
    expect(stream).toHaveAttribute('tabindex', '0');
    expect(shots).toHaveAttribute('tabindex', '-1');
  });

  it('selects an option on click and reports the value', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /screenshots/i }));
    expect(onChange).toHaveBeenCalledWith('screenshots');
    expect(screen.getByRole('radio', { name: /screenshots/i })).toBeChecked();
  });

  it('moves selection with ArrowRight/ArrowDown (selection follows focus)', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const stream = screen.getByRole('radio', { name: /camera stream/i });
    stream.focus();
    fireEvent.keyDown(stream, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('screenshots');
    expect(screen.getByRole('radio', { name: /screenshots/i })).toBeChecked();
  });

  it('wraps around at the ends and supports Home/End', () => {
    const onChange = vi.fn();
    render(<Harness initial="screenshots" onChange={onChange} />);
    const shots = screen.getByRole('radio', { name: /screenshots/i });
    shots.focus();
    // last -> ArrowRight wraps to first
    fireEvent.keyDown(shots, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('stream');
    // first -> End jumps to last
    fireEvent.keyDown(screen.getByRole('radio', { name: /camera stream/i }), { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('screenshots');
    // Home jumps back to first
    fireEvent.keyDown(screen.getByRole('radio', { name: /screenshots/i }), { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('stream');
  });
});
