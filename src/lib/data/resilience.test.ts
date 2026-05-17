import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Mock ./cache so we can drive the ladder deterministically without touching
 * Redis or MSW. Each test sets up the cache state it needs.
 *
 * After #81b, getCached returns `{ data, fetchedAt }` not raw T. Our fake
 * cache stores `{ value, fetchedAt }` per entry so tests can check fetchedAt
 * propagation.
 */
type FakeEntry<T = unknown> = { value: T; fetchedAt: string | null };

const cacheState = new Map<string, FakeEntry>();

vi.mock('./cache', () => ({
  getCached: async <T>(key: string): Promise<{ data: T; fetchedAt: string | null } | null> => {
    const entry = cacheState.get(key);
    return entry ? { data: entry.value as T, fetchedAt: entry.fetchedAt } : null;
  },
  setCached: async <T>(key: string, value: T, opts?: { fetchedAt?: string }): Promise<void> => {
    cacheState.set(key, { value, fetchedAt: opts?.fetchedAt ?? null });
  },
}));

import { withResilience } from './resilience';
import type { FetchResult } from './types';

beforeEach(() => {
  cacheState.clear();
  vi.restoreAllMocks();
});

const TODAY = new Date().toISOString().slice(0, 10);

describe('withResilience', () => {
  it('returns the cached value on hit (fresh:false), without calling the fetcher', async () => {
    cacheState.set('foo:2026-05-15', { value: { v: 'cached' }, fetchedAt: '2026-05-15' });
    const fetcher = vi.fn().mockResolvedValue({ ok: true, data: { v: 'live' }, fresh: true });

    const result = await withResilience('foo:2026-05-15', { fetcher });

    expect(result).toEqual({
      ok: true,
      data: { v: 'cached' },
      fresh: false,
      fetchedAt: '2026-05-15',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('cache hit with legacy raw value (no fetchedAt in envelope) omits fetchedAt in result', async () => {
    // Legacy: a cache entry written before #81b. getCached returns
    // fetchedAt: null; withResilience should drop the field rather than emit
    // `fetchedAt: null` in the public result (the UI checks presence).
    cacheState.set('foo:2026-05-15', { value: { v: 'old' }, fetchedAt: null });
    const fetcher = vi.fn();

    const result = await withResilience('foo:2026-05-15', { fetcher });

    expect(result).toEqual({ ok: true, data: { v: 'old' }, fresh: false });
    // No fetchedAt key in result — UI treats absence as "unknown, no caption"
    expect('fetchedAt' in result).toBe(false);
  });

  it('on miss: calls the fetcher, writes the result to cache with fetchedAt: today, returns fresh:true', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      data: { v: 'live' },
      fresh: true,
    } satisfies FetchResult<{
      v: string;
    }>);

    const result = await withResilience('foo:2026-05-15', { fetcher });

    expect(result).toEqual({ ok: true, data: { v: 'live' }, fresh: true, fetchedAt: TODAY });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(cacheState.get('foo:2026-05-15')).toEqual({ value: { v: 'live' }, fetchedAt: TODAY });
  });

  it('on miss + fetcher failure + stale present: returns the stale value (fresh:false) with the stale fetchedAt', async () => {
    cacheState.set('foo:2026-05-14', { value: { v: 'yesterday' }, fetchedAt: '2026-05-14' });
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'http 503',
    } satisfies FetchResult<{ v: string }>);

    const result = await withResilience('foo:2026-05-15', {
      fetcher,
      staleFallbackKey: 'foo:2026-05-14',
    });

    expect(result).toEqual({
      ok: true,
      data: { v: 'yesterday' },
      fresh: false,
      fetchedAt: '2026-05-14',
    });
  });

  it('on miss + fetcher failure + no stale: returns structured could-not-load', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'http 503',
    } satisfies FetchResult<unknown>);

    const result = await withResilience('foo:2026-05-15', {
      fetcher,
      staleFallbackKey: 'foo:2026-05-14', // present but cache is empty for it
    });

    expect(result).toEqual({ ok: false, reason: 'could-not-load: http 503' });
  });

  it('does not poison cache on fetcher failure', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'timeout',
    } satisfies FetchResult<unknown>);

    await withResilience('foo:2026-05-15', { fetcher });

    expect(cacheState.has('foo:2026-05-15')).toBe(false);
  });

  it('without staleFallbackKey: failure short-circuits to could-not-load', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'http 500',
    } satisfies FetchResult<unknown>);

    const result = await withResilience('foo:2026-05-15', { fetcher });

    expect(result).toEqual({ ok: false, reason: 'could-not-load: http 500' });
  });
});
