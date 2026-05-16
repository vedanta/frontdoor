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
import { apiKeyKey, configKey, emailKey, slugKey, USERS_SET, userKey } from '@/lib/kv';
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

describe('POST /api/keys', () => {
  it('new email: mints + seeds KV + sends email; never returns the key in HTTP', async () => {
    const res = await POST(postReq({ email: 'New@Example.com' }));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ status: 'check your email' });

    // Email captured
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe('new@example.com'); // lowercased
    expect(sentEmails[0].key).toMatch(/^[0-9a-f]{32}$/);
    expect(sentEmails[0].url).toContain('http://localhost:3000/?key=');

    // KV written across all key spaces
    const apiKey = sentEmails[0].key;
    const userId = (await fakeRedis.get(apiKeyKey(apiKey))) as string;
    expect(userId).toBeDefined();
    expect(await fakeRedis.get(emailKey('new@example.com'))).toBe(userId);
    const user = await fakeRedis.get(userKey(userId));
    expect(user).toMatchObject({ email: 'new@example.com', apiKey });
    expect(await fakeRedis.get(configKey(userId))).toEqual(DEFAULT_CONFIG);
    expect(await fakeRedis.get(slugKey((user as { slug: string }).slug))).toBe(userId);
    expect(kvSets.get(USERS_SET)?.has(userId)).toBe(true);
  });

  it('idempotent: known email re-sends the existing key (no new mint)', async () => {
    await POST(postReq({ email: 'foo@example.com' }));
    const firstKey = sentEmails[0].key;
    const firstUserId = await fakeRedis.get(emailKey('foo@example.com'));

    sentEmails.length = 0;
    await POST(postReq({ email: 'Foo@Example.com' }));

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].key).toBe(firstKey); // SAME key, not a new mint
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
