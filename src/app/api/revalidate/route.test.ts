import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const revalidateAllCalls: number[] = [];
const revalidateOneCalls: string[] = [];

vi.mock('@/lib/cron/revalidate', () => ({
  revalidateAllUsers: async () => {
    revalidateAllCalls.push(Date.now());
    return { revalidated: 4, failed: [] };
  },
  revalidateOneUser: async (userId: string) => {
    revalidateOneCalls.push(userId);
    return userId !== 'u_missing';
  },
}));

import { POST } from './route';
import { NextRequest } from 'next/server';

const URL_BASE = 'http://localhost:3000/api/revalidate';
const ORIG_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = 'test-cron-secret';
  revalidateAllCalls.length = 0;
  revalidateOneCalls.length = 0;
});

afterEach(() => {
  process.env.CRON_SECRET = ORIG_SECRET;
});

function postReq(opts: { auth?: string | null; userId?: string } = {}): NextRequest {
  const url = new URL(URL_BASE);
  if (opts.userId) url.searchParams.set('userId', opts.userId);
  const headers = new Headers();
  if (opts.auth !== null)
    headers.set('authorization', opts.auth ?? `Bearer ${process.env.CRON_SECRET}`);
  return new NextRequest(url, { method: 'POST', headers });
}

describe('POST /api/revalidate', () => {
  it('no userId → revalidates all', async () => {
    const res = await POST(postReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; revalidated: number };
    expect(body.ok).toBe(true);
    expect(body.revalidated).toBe(4);
    expect(revalidateAllCalls).toHaveLength(1);
    expect(revalidateOneCalls).toHaveLength(0);
  });

  it('with ?userId= → revalidates only that user', async () => {
    const res = await POST(postReq({ userId: 'u_42' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; userId: string };
    expect(body.ok).toBe(true);
    expect(body.userId).toBe('u_42');
    expect(revalidateOneCalls).toEqual(['u_42']);
    expect(revalidateAllCalls).toHaveLength(0);
  });

  it('with ?userId= for missing user → ok:false but 200 (request was valid)', async () => {
    const res = await POST(postReq({ userId: 'u_missing' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it('401 without Authorization', async () => {
    const res = await POST(postReq({ auth: null }));
    expect(res.status).toBe(401);
  });

  it('401 with wrong token', async () => {
    const res = await POST(postReq({ auth: 'Bearer wrong' }));
    expect(res.status).toBe(401);
  });
});
