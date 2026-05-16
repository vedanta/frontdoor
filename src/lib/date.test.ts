import { describe, expect, it } from 'vitest';
import { dayOfYear } from './date';

describe('dayOfYear', () => {
  it('returns 1 for January 1st', () => {
    expect(dayOfYear(new Date('2026-01-01T00:00:00Z'))).toBe(1);
  });

  it('returns 32 for February 1st (non-leap year)', () => {
    expect(dayOfYear(new Date('2026-02-01T00:00:00Z'))).toBe(32);
  });

  it('handles leap years (Feb 29 in 2024 → 60)', () => {
    expect(dayOfYear(new Date('2024-02-29T00:00:00Z'))).toBe(60);
  });

  it('returns 365 for Dec 31 in a non-leap year', () => {
    expect(dayOfYear(new Date('2026-12-31T00:00:00Z'))).toBe(365);
  });

  it('is UTC-stable (TZ offset does not change the day)', () => {
    // Two times that are the same UTC calendar day but different local days.
    expect(dayOfYear(new Date('2026-05-15T23:30:00Z'))).toBe(
      dayOfYear(new Date('2026-05-15T01:00:00Z')),
    );
  });
});
