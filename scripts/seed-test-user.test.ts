import { beforeEach, describe, expect, it, vi } from 'vitest';

const kvStore = new Map<string, unknown>();
const kvSets = new Map<string, Set<string>>();

const fakeRedis = {
  get: async <T>(k: string): Promise<T | null> => (kvStore.has(k) ? (kvStore.get(k) as T) : null),
  set: async (k: string, v: unknown): Promise<'OK'> => {
    kvStore.set(k, v);
    return 'OK';
  },
  sadd: async (k: string, ...members: string[]): Promise<number> => {
    let set = kvSets.get(k);
    if (!set) {
      set = new Set();
      kvSets.set(k, set);
    }
    let added = 0;
    for (const m of members) {
      if (!set.has(m)) {
        set.add(m);
        added++;
      }
    }
    return added;
  },
};

vi.mock('../src/lib/kv', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getRedis: () => fakeRedis };
});

import { seedUser } from './seed-test-user';
import { apiKeyKey, configKey, emailKey, slugKey, USERS_SET, userKey } from '../src/lib/kv';
import { DEFAULT_CONFIG } from '../src/lib/config';

beforeEach(() => {
  kvStore.clear();
  kvSets.clear();
});

describe('seedUser', () => {
  it('writes every KV key space with sane defaults', async () => {
    const result = await seedUser();

    expect(result.email).toBe('dev@frontdoor.app');
    expect(result.apiKey).toMatch(/^[0-9a-f]{32}$/);
    expect(result.slug).toMatch(/^[0-9a-f]{8}$/);
    expect(result.userId).toBe('u_dev_local');

    expect(await fakeRedis.get(apiKeyKey(result.apiKey))).toBe('u_dev_local');
    expect(await fakeRedis.get(slugKey(result.slug))).toBe('u_dev_local');
    expect(await fakeRedis.get(emailKey('dev@frontdoor.app'))).toBe('u_dev_local');
    expect(await fakeRedis.get(userKey('u_dev_local'))).toMatchObject({
      email: 'dev@frontdoor.app',
      apiKey: result.apiKey,
      slug: result.slug,
    });
    expect(await fakeRedis.get(configKey('u_dev_local'))).toEqual(DEFAULT_CONFIG);
    expect(kvSets.get(USERS_SET)?.has('u_dev_local')).toBe(true);
  });

  it('respects overrides', async () => {
    const result = await seedUser({
      email: 'other@example.com',
      apiKey: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab',
      slug: 'aaaaaaab',
      userId: 'u_test_other',
    });

    expect(result.email).toBe('other@example.com');
    expect(await fakeRedis.get(emailKey('other@example.com'))).toBe('u_test_other');
    expect(await fakeRedis.get(apiKeyKey('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab'))).toBe('u_test_other');
  });

  it('lowercases the email before keying KV', async () => {
    await seedUser({ email: 'MiXeD@CASE.com' });
    // Check the raw KV store — the stored key uses the lowercased email.
    expect(kvStore.has('email:mixed@case.com')).toBe(true);
    expect(kvStore.has('email:MiXeD@CASE.com')).toBe(false);
  });

  it('is idempotent — re-running with the same args is a no-op for the users set', async () => {
    await seedUser();
    const sizeAfterFirst = kvSets.get(USERS_SET)?.size;
    await seedUser();
    expect(kvSets.get(USERS_SET)?.size).toBe(sizeAfterFirst);
  });
});
