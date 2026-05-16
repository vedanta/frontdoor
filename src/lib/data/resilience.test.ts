import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Mock ./cache so we can drive the ladder deterministically without touching
 * Redis or MSW. Each test sets up the cache state it needs.
 */
const cacheState = new Map<string, unknown>();

vi.mock('./cache', () => ({
  getCached: async <T>(key: string): Promise<T | null> => {
    return cacheState.has(key) ? (cacheState.get(key) as T) : null;
  },
  setCached: async <T>(key: string, value: T): Promise<void> => {
    cacheState.set(key, value);
  },
}));

import { withResilience } from './resilience';
import type { FetchResult } from './types';

beforeEach(() => {
  cacheState.clear();
  vi.restoreAllMocks();
});

describe('withResilience', () => {
  it('returns the cached value on hit (fresh:false), without calling the fetcher', async () => {
    cacheState.set('foo:2026-05-15', { v: 'cached' });
    const fetcher = vi.fn().mockResolvedValue({ ok: true, data: { v: 'live' }, fresh: true });

    const result = await withResilience('foo:2026-05-15', { fetcher });

    expect(result).toEqual({ ok: true, data: { v: 'cached' }, fresh: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('on miss: calls the fetcher, writes the result to cache, returns fresh:true', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      data: { v: 'live' },
      fresh: true,
    } satisfies FetchResult<{
      v: string;
    }>);

    const result = await withResilience('foo:2026-05-15', { fetcher });

    expect(result).toEqual({ ok: true, data: { v: 'live' }, fresh: true });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(cacheState.get('foo:2026-05-15')).toEqual({ v: 'live' });
  });

  it('on miss + fetcher failure + stale present: returns the stale value (fresh:false)', async () => {
    cacheState.set('foo:2026-05-14', { v: 'yesterday' });
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'http 503',
    } satisfies FetchResult<{ v: string }>);

    const result = await withResilience('foo:2026-05-15', {
      fetcher,
      staleFallbackKey: 'foo:2026-05-14',
    });

    expect(result).toEqual({ ok: true, data: { v: 'yesterday' }, fresh: false });
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
