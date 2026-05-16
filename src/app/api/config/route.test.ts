import { beforeEach, describe, expect, it, vi } from 'vitest';

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

// getSession mock — flip between authenticated / not, per test
let mockSession: { userId: string; slug: string } | null = null;
vi.mock('@/lib/auth', () => ({
  getSession: async () => mockSession,
}));

vi.mock('@/lib/ratelimit', () => ({
  keyLimiter: () => ({ limit: async () => ({ success: true }) }),
}));

// revalidatePath is a Next.js API that throws outside a request context.
// We mock it to a no-op so PUT tests assert the rest of the flow.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { GET, PUT } from './route';
import { NextRequest } from 'next/server';
import { configKey } from '@/lib/kv';
import { DEFAULT_CONFIG } from '@/lib/config';
import { revalidatePath } from 'next/cache';

const URL_BASE = 'http://localhost:3000/api/config';

function putReq(body: unknown): NextRequest {
  return new NextRequest(new URL(URL_BASE), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  kvStore.clear();
  mockSession = null;
  (revalidatePath as unknown as { mockClear: () => void }).mockClear();
});

describe('GET /api/config', () => {
  it('401 without a session', async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the caller's config when present", async () => {
    mockSession = { userId: 'u_1', slug: 'a1b2c3d4' };
    kvStore.set(configKey('u_1'), DEFAULT_CONFIG);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { config: typeof DEFAULT_CONFIG };
    expect(body.config.sections).toHaveLength(6);
  });

  it("404 when config is missing (shouldn't happen post-signup)", async () => {
    mockSession = { userId: 'u_1', slug: 'a1b2c3d4' };
    const res = await GET();
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/config', () => {
  it('401 without a session', async () => {
    const res = await PUT(putReq(DEFAULT_CONFIG));
    expect(res.status).toBe(401);
  });

  it('400 on invalid JSON', async () => {
    mockSession = { userId: 'u_1', slug: 'a1b2c3d4' };
    const req = new NextRequest(new URL(URL_BASE), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it('400 on config that fails Zod (wrong section count)', async () => {
    mockSession = { userId: 'u_1', slug: 'a1b2c3d4' };
    const bad = { ...DEFAULT_CONFIG, sections: DEFAULT_CONFIG.sections.slice(0, 5) };
    const res = await PUT(putReq(bad));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: unknown[] };
    expect(body.error).toBe('invalid config');
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it('persists a valid config + calls revalidatePath for the slug', async () => {
    mockSession = { userId: 'u_1', slug: 'a1b2c3d4' };
    const res = await PUT(putReq(DEFAULT_CONFIG));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(kvStore.get(configKey('u_1'))).toEqual(DEFAULT_CONFIG);
    expect(revalidatePath).toHaveBeenCalledWith('/fd/a1b2c3d4');
  });
});
