import { describe, it, expect } from 'vitest';
import { cn, formatCurrency, formatDate } from '../utils';

// Smoke tests — prove the test harness works on a fresh clone. The agents add
// real per-feature tests via /build-loop and /add-tests.
describe('cn (className merge)', () => {
  it('merges and dedupes conflicting Tailwind classes', () => {
    const hidden = false;
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-sm', hidden && 'hidden', 'font-bold')).toBe('text-sm font-bold');
  });
});

describe('formatCurrency', () => {
  it('formats a number as currency', () => {
    const out = formatCurrency(1000);
    expect(typeof out).toBe('string');
    expect(out).toMatch(/1,000/);
  });
});

describe('formatDate', () => {
  it('formats a date without throwing', () => {
    expect(() => formatDate('2026-01-15')).not.toThrow();
    expect(formatDate('2026-01-15')).toMatch(/2026/);
  });
});
