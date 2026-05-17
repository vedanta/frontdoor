import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Stub @/lib/kv so getRedis() returns an in-memory fake.
 * The fake mirrors the small slice of @upstash/redis the cache layer uses.
 */
type Stored = { value: unknown; expiresAt: number | null };

const store = new Map<string, Stored>();

const fakeRedis = {
  get: async <T>(key: string): Promise<T | null> => {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      store.delete(key);
      return null;
    }
    return entry.value as T;
  },
  set: async (key: string, value: unknown, opts?: { ex?: number }): Promise<'OK'> => {
    const expiresAt = opts?.ex ? Date.now() + opts.ex * 1000 : null;
    store.set(key, { value, expiresAt });
    return 'OK';
  },
};

vi.mock('@/lib/kv', () => ({
  getRedis: () => fakeRedis,
}));

import { getCached, setCached } from './cache';

beforeEach(() => {
  store.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cache (getCached / setCached)', () => {
  it('returns null on a missing key', async () => {
    expect(await getCached('missing')).toBeNull();
  });

  it('round-trips an object with default fetchedAt = today', async () => {
    await setCached('foo', { hello: 'world' });
    const read = await getCached<{ hello: string }>('foo');
    expect(read?.data).toEqual({ hello: 'world' });
    // fetchedAt defaults to today (YYYY-MM-DD)
    expect(read?.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('round-trips a primitive', async () => {
    await setCached('count', 42);
    const read = await getCached<number>('count');
    expect(read?.data).toBe(42);
    expect(read?.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('preserves an explicit fetchedAt', async () => {
    await setCached('foo', 1, { fetchedAt: '2026-05-15' });
    const read = await getCached<number>('foo');
    expect(read?.fetchedAt).toBe('2026-05-15');
  });

  it('reads a legacy raw value with fetchedAt: null (#81b backward compat)', async () => {
    // Simulate a value written before #81b — raw T, not wrapped in envelope
    store.set('legacy', { value: { hello: 'old' }, expiresAt: Date.now() + 60_000 });
    const read = await getCached<{ hello: string }>('legacy');
    expect(read?.data).toEqual({ hello: 'old' });
    expect(read?.fetchedAt).toBeNull();
  });

  it('defaults TTL to ~26h', async () => {
    await setCached('foo', 1);
    const entry = store.get('foo')!;
    const ttlMs = entry.expiresAt! - Date.now();
    // allow ±1 minute jitter for the test timing
    expect(ttlMs).toBeGreaterThan(25 * 60 * 60 * 1000);
    expect(ttlMs).toBeLessThan(27 * 60 * 60 * 1000);
  });

  it('accepts an explicit ttlSeconds', async () => {
    await setCached('foo', 1, { ttlSeconds: 60 });
    const entry = store.get('foo')!;
    const ttlMs = entry.expiresAt! - Date.now();
    expect(ttlMs).toBeGreaterThan(55_000);
    expect(ttlMs).toBeLessThan(65_000);
  });
});
