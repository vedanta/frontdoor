import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countStaleWidgets,
  dayOfYear,
  formatSunsetTime,
  getVersion,
  moonPhase,
  weekOfYear,
} from './colophon';

describe('getVersion', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns "dev" with no link when NODE_ENV is not production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(getVersion()).toEqual({ label: 'dev', href: null });
  });

  it('returns vX.Y.Z linked to GitHub Release in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const v = getVersion();
    expect(v.label).toMatch(/^v\d+\.\d+\.\d+/);
    expect(v.href).toMatch(/^https:\/\/github\.com\/vedanta\/frontdoor\/releases\/tag\/v\d/);
  });
});

describe('dayOfYear (UTC)', () => {
  it('Jan 1 → 1', () => {
    expect(dayOfYear(new Date(Date.UTC(2026, 0, 1)))).toBe(1);
  });

  it('Dec 31 (non-leap) → 365', () => {
    expect(dayOfYear(new Date(Date.UTC(2026, 11, 31)))).toBe(365);
  });

  it('Dec 31 (leap year) → 366', () => {
    expect(dayOfYear(new Date(Date.UTC(2024, 11, 31)))).toBe(366);
  });

  it('mid-year sample (2026-05-17) → 137', () => {
    expect(dayOfYear(new Date(Date.UTC(2026, 4, 17)))).toBe(137);
  });
});

describe('weekOfYear (ISO 8601)', () => {
  it('2026-01-01 (Thursday) → week 1', () => {
    expect(weekOfYear(new Date(Date.UTC(2026, 0, 1)))).toBe(1);
  });

  it('2026-01-05 (Monday) → week 2 (week 1 was Mon Dec 29 — Sun Jan 4)', () => {
    expect(weekOfYear(new Date(Date.UTC(2026, 0, 5)))).toBe(2);
  });

  it('2026-05-17 → week 20', () => {
    expect(weekOfYear(new Date(Date.UTC(2026, 4, 17)))).toBe(20);
  });

  it('2025-12-29 (Mon, last week of 2025) → ISO week 1 of 2026', () => {
    // ISO 8601 quirk: year-end weeks belonging to the next year's week 1.
    // Dec 29 2025 is a Monday; that week contains Thu Jan 1 2026, so it's
    // week 1 of 2026. Our function returns the bare week number; pairing
    // it with an ISO-year would need a separate helper (out of scope for #67).
    expect(weekOfYear(new Date(Date.UTC(2025, 11, 29)))).toBe(1);
  });
});

describe('moonPhase', () => {
  it('returns new moon at the reference timestamp', () => {
    // 2000-01-06 18:14 UTC is the new-moon anchor.
    expect(moonPhase(new Date(Date.UTC(2000, 0, 6, 18, 14)))).toEqual({
      emoji: '🌑',
      name: 'new moon',
    });
  });

  it('returns full moon ~14.77 days after the anchor', () => {
    // New moon + half a synodic month ≈ Jan 21, 2000 ~07:00 UTC.
    const date = new Date(Date.UTC(2000, 0, 21, 7, 0));
    expect(moonPhase(date)).toEqual({ emoji: '🌕', name: 'full moon' });
  });

  it('returns first quarter ~7.4 days after the anchor', () => {
    // New moon + quarter cycle ≈ Jan 14, 2000 ~01:00 UTC.
    const date = new Date(Date.UTC(2000, 0, 14, 1, 0));
    expect(moonPhase(date)).toEqual({ emoji: '🌓', name: 'first quarter' });
  });

  it('returns one of the 8 phase emojis for any date', () => {
    const allEmojis = new Set(['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘']);
    // Sample 40 dates across 2026; every result must be a valid phase.
    for (let d = 0; d < 40; d++) {
      const date = new Date(Date.UTC(2026, 0, 1 + d * 9));
      expect(allEmojis.has(moonPhase(date).emoji)).toBe(true);
    }
  });
});

describe('formatSunsetTime', () => {
  it('extracts HH:MM from a weather API timestamp', () => {
    expect(formatSunsetTime('2026-05-15T20:09')).toBe('20:09');
  });

  it('handles full ISO with seconds', () => {
    expect(formatSunsetTime('2026-05-15T20:09:33')).toBe('20:09');
  });

  it('returns null for null/undefined/empty input', () => {
    expect(formatSunsetTime(null)).toBeNull();
    expect(formatSunsetTime(undefined)).toBeNull();
    expect(formatSunsetTime('')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(formatSunsetTime('not-a-time')).toBeNull();
    expect(formatSunsetTime('2026-05-15')).toBeNull(); // no T component
  });
});

describe('countStaleWidgets', () => {
  const today = '2026-05-17';

  it('returns 0 when all fetchedAts are today or null', () => {
    expect(countStaleWidgets([today, today, null, null], today)).toBe(0);
  });

  it('counts widgets fetched before today', () => {
    expect(countStaleWidgets(['2026-05-16', '2026-05-15', today, null], today)).toBe(2);
  });

  it('ignores null fetchedAts (static / non-data widgets)', () => {
    expect(countStaleWidgets([null, null, null], today)).toBe(0);
  });

  it('handles empty input', () => {
    expect(countStaleWidgets([], today)).toBe(0);
  });
});
