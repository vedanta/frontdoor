import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fake KV with smembers support.
const kvStore = new Map<string, unknown>();
const kvSets = new Map<string, Set<string>>();

const fakeRedis = {
  get: async <T>(k: string): Promise<T | null> => (kvStore.has(k) ? (kvStore.get(k) as T) : null),
  smembers: async (k: string): Promise<string[]> => Array.from(kvSets.get(k) ?? []),
};

vi.mock('@/lib/kv', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getRedis: () => fakeRedis };
});

// Mock revalidatePath — capture calls so we can assert on them.
const revalidateCalls: string[] = [];
vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    revalidateCalls.push(path);
  },
}));

import { revalidateAllUsers, revalidateOneUser } from './revalidate';
import { USERS_SET, userKey } from '@/lib/kv';

beforeEach(() => {
  kvStore.clear();
  kvSets.clear();
  revalidateCalls.length = 0;
});

describe('revalidateOneUser', () => {
  it('returns true and calls revalidatePath when user.slug exists', async () => {
    kvStore.set(userKey('u_1'), {
      email: 'x',
      apiKey: 'k',
      slug: 'abc12345',
      createdAt: 't',
    });
    expect(await revalidateOneUser('u_1')).toBe(true);
    expect(revalidateCalls).toEqual(['/d/abc12345']);
  });

  it('returns false when user record is missing', async () => {
    expect(await revalidateOneUser('u_missing')).toBe(false);
    expect(revalidateCalls).toEqual([]);
  });

  it('returns false when user record has no slug', async () => {
    kvStore.set(userKey('u_corrupt'), { email: 'x' });
    expect(await revalidateOneUser('u_corrupt')).toBe(false);
  });
});

describe('revalidateAllUsers', () => {
  it('enumerates the users set and revalidates each', async () => {
    kvSets.set(USERS_SET, new Set(['u_1', 'u_2', 'u_3']));
    kvStore.set(userKey('u_1'), { email: 'a', apiKey: 'k1', slug: 's1', createdAt: 't' });
    kvStore.set(userKey('u_2'), { email: 'b', apiKey: 'k2', slug: 's2', createdAt: 't' });
    kvStore.set(userKey('u_3'), { email: 'c', apiKey: 'k3', slug: 's3', createdAt: 't' });

    const summary = await revalidateAllUsers();

    expect(summary.revalidated).toBe(3);
    expect(summary.failed).toEqual([]);
    expect(revalidateCalls.sort()).toEqual(['/d/s1', '/d/s2', '/d/s3']);
  });

  it('records missing-record failures without stopping', async () => {
    kvSets.set(USERS_SET, new Set(['u_present', 'u_missing']));
    kvStore.set(userKey('u_present'), { email: 'x', apiKey: 'k', slug: 's-ok', createdAt: 't' });

    const summary = await revalidateAllUsers();

    expect(summary.revalidated).toBe(1);
    expect(summary.failed).toEqual(['u_missing']);
    expect(revalidateCalls).toEqual(['/d/s-ok']);
  });

  it('empty users set: no-op', async () => {
    const summary = await revalidateAllUsers();
    expect(summary.revalidated).toBe(0);
    expect(summary.failed).toEqual([]);
    expect(revalidateCalls).toEqual([]);
  });
});
