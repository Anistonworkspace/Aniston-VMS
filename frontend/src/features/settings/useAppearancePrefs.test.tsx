import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { installMatchMedia } from '@/test/matchMedia';
import { AppearanceProvider } from './AppearanceProvider';
import { useAppearancePrefs } from './useAppearancePrefs';
import { THEME_STORAGE_KEY } from './theme';

function Probe() {
  const { prefs, update } = useAppearancePrefs();
  return (
    <div>
      <span data-testid="theme">{prefs.theme}</span>
      <button type="button" onClick={() => update('theme', 'light')}>
        light
      </button>
      <button type="button" onClick={() => update('theme', 'dark')}>
        dark
      </button>
      <button type="button" onClick={() => update('theme', 'system')}>
        system
      </button>
    </div>
  );
}

const html = () => document.documentElement;

describe('AppearanceProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    html().classList.remove('dark');
    installMatchMedia(false); // OS = light by default
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    html().classList.remove('dark');
  });

  it('applies the saved dark theme on initial load (before any interaction)', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ theme: 'dark' }));
    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>
    );
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(html().classList.contains('dark')).toBe(true);
  });

  it('selecting Light removes the dark class and persists the choice', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ theme: 'dark' }));
    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>
    );
    expect(html().classList.contains('dark')).toBe(true);

    fireEvent.click(screen.getByText('light'));

    expect(html().classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toContain('"theme":"light"');
  });

  it('selecting Dark adds the dark class and persists the choice', () => {
    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>
    );
    fireEvent.click(screen.getByText('dark'));

    expect(html().classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toContain('"theme":"dark"');
  });

  it('System follows the OS preference at mount', () => {
    vi.unstubAllGlobals();
    installMatchMedia(true); // OS = dark
    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>
    );
    expect(html().classList.contains('dark')).toBe(true);
  });

  it('System reacts immediately to a live OS theme change', () => {
    const mm = installMatchMedia(false);
    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>
    );
    // default theme is system; OS starts light
    expect(html().classList.contains('dark')).toBe(false);

    act(() => mm.setMatches(true)); // OS flips to dark

    expect(html().classList.contains('dark')).toBe(true);
  });

  it('does NOT follow the OS once an explicit theme is chosen', () => {
    const mm = installMatchMedia(false);
    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>
    );
    fireEvent.click(screen.getByText('light'));
    expect(html().classList.contains('dark')).toBe(false);

    act(() => mm.setMatches(true)); // OS goes dark, but user picked Light

    expect(html().classList.contains('dark')).toBe(false);
  });

  it('persists the selection across a remount (survives refresh)', () => {
    const first = render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>
    );
    fireEvent.click(screen.getByText('dark'));
    first.unmount();
    html().classList.remove('dark'); // simulate a fresh document

    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>
    );
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(html().classList.contains('dark')).toBe(true);
  });
});

describe('useAppearancePrefs — provider guard', () => {
  it('throws a clear error when used outside an <AppearanceProvider>', () => {
    // With no provider above it the hook reads a null context; rendering the
    // consumer must throw an actionable message rather than silently handing
    // back undefined prefs (which would blow up later, far from the cause).
    function Orphan() {
      useAppearancePrefs();
      return null;
    }
    // React re-throws the render error to console.error; silence it so the
    // suite output stays clean while we assert on the thrown message.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => render(<Orphan />)).toThrow(
        /useAppearancePrefs must be used within an <AppearanceProvider>/
      );
    } finally {
      spy.mockRestore();
    }
  });
});
