import { describe, expect, it } from 'vitest';
import { fetchStoic, STOIC } from './stoic';

describe('fetchStoic', () => {
  it('returns the same quote for the same day (deterministic)', () => {
    const d = new Date('2026-05-15T12:00:00Z');
    expect(fetchStoic(d)).toEqual(fetchStoic(d));
  });

  it('produces every quote in STOIC across a full year', () => {
    const seen = new Set<string>();
    for (let i = 1; i <= 366; i++) {
      const d = new Date(Date.UTC(2026, 0, i));
      const r = fetchStoic(d);
      if (r.ok) seen.add(r.data.body);
    }
    expect(seen.size).toBe(STOIC.length);
  });

  it("returns ok:true, fresh:false, with sourceLabel 'from the stoics'", () => {
    const r = fetchStoic(new Date('2026-05-15T12:00:00Z'));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fresh).toBe(false);
      expect(r.data.sourceLabel).toBe('from the stoics');
      expect(r.data.body.length).toBeGreaterThan(0);
      expect(r.data.attribution.length).toBeGreaterThan(0);
    }
  });

  it('has the expected ~31 quotes', () => {
    expect(STOIC.length).toBeGreaterThanOrEqual(31);
    expect(STOIC.length).toBeLessThanOrEqual(40);
  });
});
