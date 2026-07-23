import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCameraViewMode } from './useCameraViewMode';

const KEY = 'aniston-vms:camera-view-mode';

beforeEach(() => {
  window.localStorage.clear();
});

describe('useCameraViewMode', () => {
  it('defaults to "screenshots" when nothing is stored', () => {
    const { result } = renderHook(() => useCameraViewMode());
    expect(result.current[0]).toBe('screenshots');
  });

  it('restores a previously stored mode over the default', () => {
    window.localStorage.setItem(KEY, 'stream');
    const { result } = renderHook(() => useCameraViewMode());
    expect(result.current[0]).toBe('stream');
  });

  it('falls back to the default for an invalid stored value', () => {
    window.localStorage.setItem(KEY, 'not-a-mode');
    const { result } = renderHook(() => useCameraViewMode());
    expect(result.current[0]).toBe('screenshots');
  });

  it('persists the mode to localStorage when changed away from the default', () => {
    const { result } = renderHook(() => useCameraViewMode());
    act(() => result.current[1]('stream'));
    expect(result.current[0]).toBe('stream');
    expect(window.localStorage.getItem(KEY)).toBe('stream');
  });
});
