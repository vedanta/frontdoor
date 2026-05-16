import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all the data fetchers — return synthetic FetchResult.
const happy = { ok: true as const, fresh: true, data: { _t: 'x' } as unknown };

// `bingFails` lives inside a hoisted ref so the vi.mock factory captures the
// same object as the test body (vi.mock is hoisted above plain `let`).
const { bingFails } = vi.hoisted(() => ({ bingFails: { value: false } }));

vi.mock('@/lib/data/sources/nasa-apod', () => ({ fetchNasaApod: async () => happy }));
vi.mock('@/lib/data/sources/bing-daily', () => ({
  fetchBingDaily: async () =>
    bingFails.value ? { ok: false, reason: 'http 503' } : happy,
}));
vi.mock('@/lib/data/sources/wikimedia-potd', () => ({ fetchWikimediaPotd: async () => happy }));
vi.mock('@/lib/data/sources/quote', () => ({ fetchQuote: async () => happy }));
vi.mock('@/lib/data/sources/poem', () => ({ fetchPoem: async () => happy }));
vi.mock('@/lib/data/sources/onthisday', () => ({ fetchOnThisDay: async () => happy }));
vi.mock('@/lib/data/sources/wikipedia', () => ({ fetchWikipediaFeatured: async () => happy }));
vi.mock('@/lib/data/sources/word', () => ({ fetchWord: async () => happy }));
vi.mock('@/lib/data/sources/headlines', () => ({ fetchHeadlines: async () => happy }));

// Stub revalidate helpers — assert they were called.
const revalidateAllCalls: number[] = [];
vi.mock('@/lib/cron/revalidate', () => ({
  revalidateAllUsers: async () => {
    revalidateAllCalls.push(Date.now());
    return { revalidated: 7, failed: [] };
  },
}));

import { POST } from './route';
import { NextRequest } from 'next/server';

const URL_BASE = 'http://localhost:3000/api/refresh';

const ORIG_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = 'test-cron-secret';
  bingFails.value = false;
  revalidateAllCalls.length = 0;
});

afterEach(() => {
  process.env.CRON_SECRET = ORIG_SECRET;
});

function postReq(authHeader: string | null = `Bearer ${process.env.CRON_SECRET}`): NextRequest {
  const headers = new Headers();
  if (authHeader) headers.set('authorization', authHeader);
  return new NextRequest(new URL(URL_BASE), { method: 'POST', headers });
}

describe('POST /api/refresh', () => {
  it('all sources ok → ok:true, warmed equals task count', async () => {
    const res = await POST(postReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      warmed: number;
      failed: string[];
      revalidated: number;
    };
    expect(body.ok).toBe(true);
    expect(body.warmed).toBeGreaterThan(8); // 8 singletons + ≥1 headlines
    expect(body.failed).toEqual([]);
    expect(body.revalidated).toBe(7);
    expect(revalidateAllCalls).toHaveLength(1);
  });

  it('partial failure surfaces failed sources without crashing', async () => {
    bingFails.value = true;
    const res = await POST(postReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; failed: string[] };
    expect(body.ok).toBe(false);
    expect(body.failed).toContain('bing-daily');
  });

  it('401 without Authorization header', async () => {
    const res = await POST(postReq(null));
    expect(res.status).toBe(401);
    expect(revalidateAllCalls).toHaveLength(0);
  });

  it('401 with wrong bearer token', async () => {
    const res = await POST(postReq('Bearer wrong'));
    expect(res.status).toBe(401);
  });
});
