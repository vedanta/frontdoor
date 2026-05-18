import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory KV fake — covers get/set/del/srem (the slice this route uses).
const kvStore = new Map<string, unknown>();
const kvSets = new Map<string, Set<string>>();

const fakeRedis = {
  get: async <T>(k: string): Promise<T | null> => (kvStore.has(k) ? (kvStore.get(k) as T) : null),
  set: async (k: string, v: unknown): Promise<'OK'> => {
    kvStore.set(k, v);
    return 'OK';
  },
  del: async (k: string): Promise<number> => {
    const had = kvStore.delete(k);
    return had ? 1 : 0;
  },
  srem: async (k: string, ...members: string[]): Promise<number> => {
    const set = kvSets.get(k);
    if (!set) return 0;
    let removed = 0;
    for (const m of members) {
      if (set.delete(m)) removed++;
    }
    return removed;
  },
};

vi.mock('@/lib/kv', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getRedis: () => fakeRedis };
});

// Mock the session — each test arranges which userId it wants.
let mockSession: { userId: string; slug: string } | null = null;
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getSession: async () => mockSession,
    getSessionFromCookie: async () => mockSession,
  };
});

import { DELETE, GET, PUT } from './route';
import { NextRequest } from 'next/server';
import { apiKeyKey, configKey, emailKey, slugKey, USERS_SET, userKey } from '@/lib/kv';

const URL_BASE = 'http://localhost:3000/api/user';

function bodyReq(method: 'PUT' | 'DELETE', body: unknown): NextRequest {
  return new NextRequest(new URL(URL_BASE), {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function emptyReq(method: 'PUT' | 'DELETE'): NextRequest {
  return new NextRequest(new URL(URL_BASE), { method });
}

// Seed a "logged-in user" — sets up the KV state + the mocked session.
function seedUser(overrides: Partial<{ email: string; name: string; timezone: string }> = {}) {
  const userId = 'u_1';
  const slug = 'deadbeef';
  const apiKey = 'fd_deadbeefdeadbeefdeadbeefdeadbeef'; // #72-format
  const email = overrides.email ?? 'me@example.com';
  const user = {
    email,
    apiKey,
    slug,
    name: overrides.name,
    timezone: overrides.timezone,
    createdAt: '2026-05-17T00:00:00.000Z',
  };
  kvStore.set(userKey(userId), user);
  kvStore.set(emailKey(email), userId);
  kvStore.set(slugKey(slug), userId);
  kvStore.set(apiKeyKey(apiKey), userId);
  kvStore.set(configKey(userId), { title: 'mock dashboard', sections: [] });
  kvSets.set(USERS_SET, new Set([userId]));
  mockSession = { userId, slug };
  return { userId, slug, apiKey, email };
}

beforeEach(() => {
  kvStore.clear();
  kvSets.clear();
  mockSession = null;
});

// ── GET ────────────────────────────────────────────────────────────────

describe('GET /api/user', () => {
  it('401 when no session', async () => {
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('returns sanitized user (no apiKey)', async () => {
    seedUser({ name: 'Alice', timezone: 'America/New_York' });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({
      email: 'me@example.com',
      slug: 'deadbeef',
      name: 'Alice',
      timezone: 'America/New_York',
      createdAt: '2026-05-17T00:00:00.000Z',
    });
    expect(body).not.toHaveProperty('apiKey');
  });

  it('404 when session valid but user record missing', async () => {
    mockSession = { userId: 'orphan', slug: 'x' };
    const res = await GET();
    expect(res.status).toBe(404);
  });
});

// ── PUT ────────────────────────────────────────────────────────────────

describe('PUT /api/user', () => {
  it('401 when no session', async () => {
    const res = await PUT(bodyReq('PUT', { name: 'X' }));
    expect(res.status).toBe(401);
  });

  it('updates name + timezone; returns sanitized shape', async () => {
    seedUser();
    const res = await PUT(bodyReq('PUT', { name: 'Bob', timezone: 'UTC' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ name: 'Bob', timezone: 'UTC', email: 'me@example.com' });
    expect(body).not.toHaveProperty('apiKey');

    // Persisted to KV
    const stored = (await fakeRedis.get(userKey('u_1'))) as { name: string; timezone: string };
    expect(stored).toMatchObject({ name: 'Bob', timezone: 'UTC' });
  });

  it('partial update preserves existing fields', async () => {
    seedUser({ name: 'Alice', timezone: 'America/New_York' });
    const res = await PUT(bodyReq('PUT', { name: 'Alice 2.0' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // name updated, timezone preserved
    expect(body).toMatchObject({ name: 'Alice 2.0', timezone: 'America/New_York' });
  });

  it('empty body is a valid no-op (returns current user)', async () => {
    seedUser({ name: 'NoChange' });
    const res = await PUT(bodyReq('PUT', {}));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ name: 'NoChange' });
  });

  it('400 on unknown field (strict)', async () => {
    seedUser();
    const res = await PUT(bodyReq('PUT', { email: 'attacker@example.com' }));
    expect(res.status).toBe(400);
  });

  it('400 on invalid name (too long)', async () => {
    seedUser();
    const res = await PUT(bodyReq('PUT', { name: 'x'.repeat(200) }));
    expect(res.status).toBe(400);
  });

  it('400 on invalid json', async () => {
    seedUser();
    const res = await PUT(
      new NextRequest(new URL(URL_BASE), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: '{ not json',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('400 on no body at all', async () => {
    seedUser();
    const res = await PUT(emptyReq('PUT'));
    expect(res.status).toBe(400);
  });
});

// ── DELETE ─────────────────────────────────────────────────────────────

describe('DELETE /api/user', () => {
  it('401 when no session', async () => {
    const res = await DELETE(bodyReq('DELETE', { confirmEmail: 'x@x.com' }));
    expect(res.status).toBe(401);
  });

  it('400 when confirmEmail missing', async () => {
    seedUser();
    const res = await DELETE(bodyReq('DELETE', {}));
    expect(res.status).toBe(400);
  });

  it('400 when confirmEmail does not match account email', async () => {
    seedUser({ email: 'me@example.com' });
    const res = await DELETE(bodyReq('DELETE', { confirmEmail: 'someone-else@example.com' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/does not match/);
    // Nothing wiped — user record still present
    expect(await fakeRedis.get(userKey('u_1'))).not.toBeNull();
  });

  it('400 when no body', async () => {
    seedUser();
    const res = await DELETE(emptyReq('DELETE'));
    expect(res.status).toBe(400);
  });

  it('case-insensitive email match (server lowercases both sides)', async () => {
    const u = seedUser({ email: 'me@example.com' });
    const res = await DELETE(bodyReq('DELETE', { confirmEmail: 'ME@EXAMPLE.COM' }));
    expect(res.status).toBe(204);
    expect(await fakeRedis.get(userKey(u.userId))).toBeNull();
  });

  it('happy path: wipes every KV key + USERS set + clears cookie', async () => {
    const u = seedUser();
    const res = await DELETE(bodyReq('DELETE', { confirmEmail: u.email }));

    expect(res.status).toBe(204);

    // All 5 keys gone
    expect(await fakeRedis.get(userKey(u.userId))).toBeNull();
    expect(await fakeRedis.get(configKey(u.userId))).toBeNull();
    expect(await fakeRedis.get(emailKey(u.email))).toBeNull();
    expect(await fakeRedis.get(slugKey(u.slug))).toBeNull();
    expect(await fakeRedis.get(apiKeyKey(u.apiKey))).toBeNull();

    // SREM happened
    expect(kvSets.get(USERS_SET)?.has(u.userId)).toBe(false);

    // Set-Cookie clears the session cookie (Max-Age=0)
    const cookieHeader = res.headers.get('set-cookie') ?? '';
    expect(cookieHeader).toMatch(/frontdoor_session=/);
    expect(cookieHeader.toLowerCase()).toMatch(/max-age=0/);
  });

  it('404 when session valid but user record missing (no wipe)', async () => {
    mockSession = { userId: 'orphan', slug: 'x' };
    const res = await DELETE(bodyReq('DELETE', { confirmEmail: 'x@x.com' }));
    expect(res.status).toBe(404);
  });
});
