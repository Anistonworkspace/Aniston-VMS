import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { installMatchMedia } from '@/test/matchMedia';
import { AppearanceProvider } from './AppearanceProvider';
import { AppearancePanel } from './AppearancePanel';
import { THEME_STORAGE_KEY } from './theme';
import type { useToast } from '@/hooks/useToast';

const html = () => document.documentElement;

// A structural stand-in for the useToast() return value. We only care that the
// panel calls toast.success with the right label; the spies let us assert that.
function makeToast() {
  return {
    toasts: [],
    dismiss: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  };
}

function renderPanel(toast = makeToast()) {
  render(
    <AppearanceProvider>
      <AppearancePanel toast={toast as unknown as ReturnType<typeof useToast>} />
    </AppearanceProvider>
  );
  return toast;
}

const themeButton = (name: 'Light' | 'Dark' | 'System') =>
  screen.getByRole('button', { name });

const isPressed = (name: 'Light' | 'Dark' | 'System') =>
  themeButton(name).getAttribute('aria-pressed') === 'true';

describe('AppearancePanel — theme selector', () => {
  beforeEach(() => {
    window.localStorage.clear();
    html().classList.remove('dark');
    installMatchMedia(false); // OS = light by default
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    html().classList.remove('dark');
  });

  it('defaults to System when no preference is saved', () => {
    renderPanel();
    expect(isPressed('System')).toBe(true);
    expect(isPressed('Light')).toBe(false);
    expect(isPressed('Dark')).toBe(false);
  });

  it('reflects a saved Dark preference: the Dark button is pre-selected', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ theme: 'dark' }));
    renderPanel();
    expect(isPressed('Dark')).toBe(true);
    expect(isPressed('Light')).toBe(false);
    expect(isPressed('System')).toBe(false);
    // The provider has already applied the saved choice to the document.
    expect(html().classList.contains('dark')).toBe(true);
  });

  it('clicking Dark switches the theme, moves the pressed state, persists, and toasts', () => {
    const toast = renderPanel();
    expect(html().classList.contains('dark')).toBe(false);

    fireEvent.click(themeButton('Dark'));

    expect(html().classList.contains('dark')).toBe(true);
    expect(isPressed('Dark')).toBe(true);
    expect(isPressed('System')).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toContain('"theme":"dark"');
    expect(toast.success).toHaveBeenCalledWith('Theme set to Dark');
  });

  it('clicking Light clears an active Dark theme, persists, and toasts', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ theme: 'dark' }));
    const toast = renderPanel();
    expect(html().classList.contains('dark')).toBe(true);

    fireEvent.click(themeButton('Light'));

    expect(html().classList.contains('dark')).toBe(false);
    expect(isPressed('Light')).toBe(true);
    expect(isPressed('Dark')).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toContain('"theme":"light"');
    expect(toast.success).toHaveBeenCalledWith('Theme set to Light');
  });
});
