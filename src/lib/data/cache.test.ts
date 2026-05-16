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

  it('round-trips an object', async () => {
    await setCached('foo', { hello: 'world' });
    expect(await getCached<{ hello: string }>('foo')).toEqual({ hello: 'world' });
  });

  it('round-trips a primitive', async () => {
    await setCached('count', 42);
    expect(await getCached<number>('count')).toBe(42);
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
