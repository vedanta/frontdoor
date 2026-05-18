import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory KV fake covering get / set / sadd (the slice this route uses).
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

vi.mock('@/lib/kv', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getRedis: () => fakeRedis };
});

// Capture email sends without hitting Resend.
const sentEmails: Array<{ to: string; key: string; url: string }> = [];
vi.mock('@/lib/email', () => ({
  sendKeyEmail: async (args: { to: string; key: string; url: string }) => {
    sentEmails.push(args);
    return { ok: true, id: 'mock-id' };
  },
}));

// Stub the rate limiters to always succeed (Upstash Ratelimit needs live Redis).
vi.mock('@/lib/ratelimit', () => ({
  clientIp: () => 'test-ip',
  ipLimiter: () => ({ limit: async () => ({ success: true }) }),
  emailLimiter: () => ({ limit: async () => ({ success: true }) }),
  keyLimiter: () => ({ limit: async () => ({ success: true }) }),
}));

import { POST } from './route';
import { NextRequest } from 'next/server';
import {
  apiKeyKey,
  bootstrapKey,
  configKey,
  emailKey,
  slugKey,
  USERS_SET,
  userKey,
  type BootstrapRecord,
} from '@/lib/kv';
import { DEFAULT_CONFIG } from '@/lib/config';

function postReq(body: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost:3000/api/keys'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  kvStore.clear();
  kvSets.clear();
  sentEmails.length = 0;
});

/** Extract the bootstrap token from an emailed URL like `…/?bootstrap=fdb_…`. */
function tokenFromUrl(url: string): string {
  const m = url.match(/[?&]bootstrap=([^&]+)/);
  if (!m) throw new Error(`no bootstrap token in url: ${url}`);
  return m[1];
}

describe('POST /api/keys', () => {
  it('new email: mints + seeds KV + sends ?bootstrap= URL; apiKey never in URL', async () => {
    const res = await POST(postReq({ email: 'New@Example.com' }));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ status: 'check your email' });

    // Email captured
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe('new@example.com'); // lowercased
    expect(sentEmails[0].key).toMatch(/^fd_[0-9a-f]{32}$/); // #72 — `fd_` prefix

    // #73: URL contains ?bootstrap=fdb_…, NOT ?key=
    expect(sentEmails[0].url).toMatch(/\?bootstrap=fdb_[0-9a-f]{32}$/);
    expect(sentEmails[0].url).not.toContain('?key=');
    // apiKey must not appear in the URL (the whole point of #73)
    expect(sentEmails[0].url).not.toContain(sentEmails[0].key);

    // KV written across all forever-key spaces
    const apiKey = sentEmails[0].key;
    const userId = (await fakeRedis.get(apiKeyKey(apiKey))) as string;
    expect(userId).toBeDefined();
    expect(await fakeRedis.get(emailKey('new@example.com'))).toBe(userId);
    const user = await fakeRedis.get(userKey(userId));
    expect(user).toMatchObject({ email: 'new@example.com', apiKey });
    expect(await fakeRedis.get(configKey(userId))).toEqual(DEFAULT_CONFIG);
    expect(await fakeRedis.get(slugKey((user as { slug: string }).slug))).toBe(userId);
    expect(kvSets.get(USERS_SET)?.has(userId)).toBe(true);

    // #73: bootstrap:{token} written with the right shape
    const token = tokenFromUrl(sentEmails[0].url);
    const bootstrap = (await fakeRedis.get(bootstrapKey(token))) as BootstrapRecord;
    expect(bootstrap).toMatchObject({ userId, slug: (user as { slug: string }).slug });
    expect(bootstrap.exp).toBeGreaterThan(Date.now()); // future
    expect(bootstrap.exp).toBeLessThan(Date.now() + 301_000); // within ~5min
  });

  it('idempotent: known email reuses apiKey but mints a FRESH bootstrap (#73)', async () => {
    await POST(postReq({ email: 'foo@example.com' }));
    const firstKey = sentEmails[0].key;
    const firstToken = tokenFromUrl(sentEmails[0].url);
    const firstUserId = await fakeRedis.get(emailKey('foo@example.com'));

    sentEmails.length = 0;
    await POST(postReq({ email: 'Foo@Example.com' }));

    expect(sentEmails).toHaveLength(1);
    // SAME apiKey (long-lived secret stays put)
    expect(sentEmails[0].key).toBe(firstKey);
    // DIFFERENT bootstrap token (the old one is single-use; can't be re-emailed)
    const secondToken = tokenFromUrl(sentEmails[0].url);
    expect(secondToken).not.toBe(firstToken);
    // Both bootstrap records exist (Redis EX prunes them; both are valid until TTL)
    expect(await fakeRedis.get(bootstrapKey(secondToken))).toMatchObject({ userId: firstUserId });

    expect(await fakeRedis.get(emailKey('foo@example.com'))).toBe(firstUserId);
    // users set size stays 1 — no duplicate userId
    expect(kvSets.get(USERS_SET)?.size).toBe(1);
  });

  it('rejects malformed JSON with 400', async () => {
    const req = new NextRequest(new URL('http://localhost:3000/api/keys'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(sentEmails).toHaveLength(0);
  });

  it('rejects invalid email with 400', async () => {
    const res = await POST(postReq({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
    expect(sentEmails).toHaveLength(0);
  });

  it('rejects missing email field with 400', async () => {
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
  });
});
