/**
 * Tests for src/proxy.ts (#92) — focuses on which branches DO and DON'T
 * call `getRedis()`. The KV-laziness contract was broken in #73's first
 * push (`getRedis()` was hoisted out of guard clauses) and silently passed
 * the rest of the test suite because every `@/lib/kv` mock returns a fake
 * `getRedis()` that succeeds. This file uses a **throwing** default so any
 * unintentional Redis touch fails the test.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Swappable `getRedis()` implementation per test. Default = throw, so any
 * branch that touches KV when it shouldn't fails loudly. Re-assigned to a
 * working fake inside the "KV-using branches" describe block.
 */
let getRedisImpl: () => unknown = () => {
  throw new Error('proxy.test: getRedis() called from a branch that should be KV-free');
};

vi.mock('@/lib/kv', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getRedis: () => getRedisImpl() };
});

import { proxy } from './proxy';
import { apiKeyKey, bootstrapKey, userKey } from '@/lib/kv';
import { COOKIE_NAME, signCookie } from '@/lib/auth';

const TEST_COOKIE_SECRET = 'test-secret-do-not-use-in-prod-but-long-enough-yes-yes';

beforeAll(() => {
  process.env.COOKIE_SECRET = TEST_COOKIE_SECRET;
});

beforeEach(() => {
  // Default for every test: throwing. KV-using describe blocks override.
  getRedisImpl = () => {
    throw new Error('proxy.test: getRedis() called from a branch that should be KV-free');
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

/** Build a NextRequest at `path` with optional `Cookie` header. */
function buildReq(path: string, opts: { cookie?: string } = {}): NextRequest {
  const init: { headers?: Record<string, string> } = {};
  if (opts.cookie) init.headers = { cookie: opts.cookie };
  return new NextRequest(new URL(`http://localhost:3000${path}`), init);
}

// ── KV-laziness contract (#92 — pinning #73 regression) ────────────────

describe('proxy — KV-laziness contract', () => {
  it('bare `/` makes no getRedis() call', async () => {
    // The default `getRedisImpl` throws — if proxy() touched it, this would
    // bubble up and the test would fail. Reaching the assertion below means
    // proxy() left KV untouched, which is the contract.
    const res = await proxy(buildReq('/'));
    expect(res.status).toBe(200); // NextResponse.next()
  });

  it('/fd/{slug} with NO cookie makes no getRedis() call; 307 to /', async () => {
    const res = await proxy(buildReq('/fd/deadbeef'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/');
  });

  it('/fd/{slug} with valid matching cookie makes no getRedis() call; passes through', async () => {
    const cookie = await signCookie({ userId: 'u_1', slug: 'deadbeef' }, TEST_COOKIE_SECRET);
    const res = await proxy(buildReq('/fd/deadbeef', { cookie: `${COOKIE_NAME}=${cookie}` }));
    expect(res.status).toBe(200); // NextResponse.next()
  });

  it('/fd/{slug} with valid cookie but wrong slug makes no getRedis() call; 307 to own slug', async () => {
    const cookie = await signCookie({ userId: 'u_1', slug: 'mineslug' }, TEST_COOKIE_SECRET);
    const res = await proxy(buildReq('/fd/somebody-else', { cookie: `${COOKIE_NAME}=${cookie}` }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/fd/mineslug');
  });
});

// ── KV-using branches ──────────────────────────────────────────────────

describe('proxy — KV-using branches', () => {
  const fakeKv = new Map<string, unknown>();
  const fakeRedis = {
    get: async <T>(k: string): Promise<T | null> => (fakeKv.has(k) ? (fakeKv.get(k) as T) : null),
    set: async (k: string, v: unknown): Promise<'OK'> => {
      fakeKv.set(k, v);
      return 'OK';
    },
    del: async (k: string): Promise<number> => {
      const had = fakeKv.delete(k);
      return had ? 1 : 0;
    },
  };

  beforeEach(() => {
    fakeKv.clear();
    getRedisImpl = () => fakeRedis;
  });

  describe('?bootstrap= (#73 — preferred path)', () => {
    it('valid token: 307 + cookie set + bootstrap DELed', async () => {
      const token = 'fdb_validvalidvalidvalidvalidvali';
      fakeKv.set(bootstrapKey(token), {
        userId: 'u_1',
        slug: 'deadbeef',
        exp: Date.now() + 60_000,
      });

      const res = await proxy(buildReq(`/?bootstrap=${token}`));
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/fd/deadbeef');
      const setCookie = res.headers.get('set-cookie') ?? '';
      expect(setCookie).toMatch(/frontdoor_session=/);
      // Token consumed (single-use semantics)
      expect(fakeKv.has(bootstrapKey(token))).toBe(false);
    });

    it('missing token: 410 Gone', async () => {
      const res = await proxy(buildReq('/?bootstrap=fdb_does_not_exist'));
      expect(res.status).toBe(410);
      expect((await res.text()).toLowerCase()).toContain('expired');
    });

    it('expired token (exp in the past): 410 Gone — defensive check beyond Redis TTL', async () => {
      const token = 'fdb_expired';
      fakeKv.set(bootstrapKey(token), {
        userId: 'u_1',
        slug: 'deadbeef',
        exp: Date.now() - 1000, // 1s in the past
      });
      const res = await proxy(buildReq(`/?bootstrap=${token}`));
      expect(res.status).toBe(410);
    });

    it('consumed twice: first 307, second 410 (pins DEL behavior)', async () => {
      const token = 'fdb_oneuse';
      fakeKv.set(bootstrapKey(token), {
        userId: 'u_1',
        slug: 'deadbeef',
        exp: Date.now() + 60_000,
      });

      const first = await proxy(buildReq(`/?bootstrap=${token}`));
      expect(first.status).toBe(307);

      const second = await proxy(buildReq(`/?bootstrap=${token}`));
      expect(second.status).toBe(410);
    });
  });

  describe('?key= (legacy 60-day fallback)', () => {
    it('valid key: 307 + cookie set; no bootstrap interaction', async () => {
      fakeKv.set(apiKeyKey('legacy-un-prefixed-key'), 'u_legacy');
      fakeKv.set(userKey('u_legacy'), {
        email: 'x@x.com',
        apiKey: 'legacy-un-prefixed-key',
        slug: 'legacys1',
        createdAt: 'x',
      });

      const res = await proxy(buildReq('/?key=legacy-un-prefixed-key'));
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/fd/legacys1');
      expect(res.headers.get('set-cookie') ?? '').toMatch(/frontdoor_session=/);
    });

    it('unknown key: strip param + redirect to /', async () => {
      const res = await proxy(buildReq('/?key=does-not-exist-anywhere'));
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/');
    });

    it('also works for `fd_`-prefixed apiKeys via legacy path (mixed migration window)', async () => {
      const prefixedKey = 'fd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      fakeKv.set(apiKeyKey(prefixedKey), 'u_new');
      fakeKv.set(userKey('u_new'), {
        email: 'n@n.com',
        apiKey: prefixedKey,
        slug: 'newslug1',
        createdAt: 'x',
      });

      const res = await proxy(buildReq(`/?key=${prefixedKey}`));
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/fd/newslug1');
    });
  });
});
