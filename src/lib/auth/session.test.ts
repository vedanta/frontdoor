import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const kvStore = new Map<string, unknown>();
const fakeRedis = {
  get: async <T>(k: string): Promise<T | null> => (kvStore.has(k) ? (kvStore.get(k) as T) : null),
  set: async (k: string, v: unknown): Promise<'OK'> => {
    kvStore.set(k, v);
    return 'OK';
  },
};

vi.mock('@/lib/kv', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getRedis: () => fakeRedis };
});

// next/headers is a server-only API — stub it for the Bearer path test.
let mockAuthHeader: string | null = null;
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) => (name.toLowerCase() === 'authorization' ? mockAuthHeader : null),
  }),
  cookies: async () => ({ get: () => undefined }),
}));

import { getSessionFromBearer } from './session';
import { apiKeyKey, userKey } from '@/lib/kv';

beforeEach(() => {
  kvStore.clear();
  mockAuthHeader = null;
});

afterEach(() => {
  mockAuthHeader = null;
});

describe('getSessionFromBearer', () => {
  it('returns null when no Authorization header', async () => {
    expect(await getSessionFromBearer()).toBeNull();
  });

  it('returns null when header is not Bearer-shaped', async () => {
    mockAuthHeader = 'Basic abc123';
    expect(await getSessionFromBearer()).toBeNull();
  });

  it('returns null when apiKey is unknown', async () => {
    mockAuthHeader = 'Bearer unknown-key';
    expect(await getSessionFromBearer()).toBeNull();
  });

  it('resolves to {userId, slug} when apiKey + user record exist', async () => {
    kvStore.set(apiKeyKey('good-key'), 'u_42');
    kvStore.set(userKey('u_42'), {
      email: 'a@b.com',
      apiKey: 'good-key',
      slug: 'a1b2c3d4',
      createdAt: '2026-05-15T00:00:00Z',
    });
    mockAuthHeader = 'Bearer good-key';
    expect(await getSessionFromBearer()).toEqual({ userId: 'u_42', slug: 'a1b2c3d4' });
  });

  it('accepts lowercase "bearer"', async () => {
    kvStore.set(apiKeyKey('k'), 'u');
    kvStore.set(userKey('u'), { email: 'x', apiKey: 'k', slug: 's', createdAt: 'x' });
    mockAuthHeader = 'bearer k';
    expect(await getSessionFromBearer()).toEqual({ userId: 'u', slug: 's' });
  });

  // #72 backwards-compat regression guard: when the `fd_` prefix was added
  // to newly-minted keys, the explicit contract was "auth gate does NOT
  // validate the prefix — pre-existing keys keep working forever." This
  // test pins that contract. If anyone adds a `startsWith('fd_')` check at
  // the auth gate in the future, this test will fail and force the discussion.
  it('accepts a legacy un-prefixed apiKey (#72 backwards-compat)', async () => {
    const legacyKey = 'deadbeefdeadbeefdeadbeefdeadbeef'; // 32 hex, no `fd_`
    kvStore.set(apiKeyKey(legacyKey), 'u_legacy');
    kvStore.set(userKey('u_legacy'), {
      email: 'legacy@example.com',
      apiKey: legacyKey,
      slug: 'legacy01',
      createdAt: '2025-01-01T00:00:00Z',
    });
    mockAuthHeader = `Bearer ${legacyKey}`;
    expect(await getSessionFromBearer()).toEqual({ userId: 'u_legacy', slug: 'legacy01' });
  });

  it('accepts a `fd_`-prefixed apiKey (#72 forward path)', async () => {
    const prefixedKey = 'fd_deadbeefdeadbeefdeadbeefdeadbeef';
    kvStore.set(apiKeyKey(prefixedKey), 'u_new');
    kvStore.set(userKey('u_new'), {
      email: 'new@example.com',
      apiKey: prefixedKey,
      slug: 'newslug1',
      createdAt: '2026-05-18T00:00:00Z',
    });
    mockAuthHeader = `Bearer ${prefixedKey}`;
    expect(await getSessionFromBearer()).toEqual({ userId: 'u_new', slug: 'newslug1' });
  });
});
