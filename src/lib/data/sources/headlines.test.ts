import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../mocks/server';

/**
 * End-to-end: real MSW feeds + real withResilience + mocked KV.
 * Mirrors what production looks like: per-day cache key, stale fallback,
 * interleaved output.
 */

type Stored = { value: unknown; expiresAt: number | null };
const kvStore = new Map<string, Stored>();

const fakeRedis = {
  get: async <T>(key: string): Promise<T | null> => {
    const e = kvStore.get(key);
    if (!e) return null;
    if (e.expiresAt !== null && Date.now() > e.expiresAt) {
      kvStore.delete(key);
      return null;
    }
    return e.value as T;
  },
  set: async (key: string, value: unknown, opts?: { ex?: number }) => {
    const expiresAt = opts?.ex ? Date.now() + opts.ex * 1000 : null;
    kvStore.set(key, { value, expiresAt });
    return 'OK';
  },
};

vi.mock('@/lib/kv', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getRedis: () => fakeRedis,
  };
});

import { fetchHeadlines } from './headlines';

const NYT = 'https://nyt.invalid/rss';
const BBC = 'https://bbc.invalid/rss';

const RSS = (titles: string[], base: string) => `<?xml version="1.0"?>
<rss><channel>
${titles.map((t, i) => `<item><title>${t}</title><link>${base}/${i}</link></item>`).join('\n')}
</channel></rss>`;

beforeEach(() => {
  kvStore.clear();
  server.resetHandlers();
});

describe('fetchHeadlines', () => {
  it('fetches multiple feeds, interleaves, caches', async () => {
    server.use(
      http.get(NYT, () => HttpResponse.xml(RSS(['n1', 'n2', 'n3'], 'https://nyt.invalid'))),
      http.get(BBC, () => HttpResponse.xml(RSS(['b1', 'b2', 'b3'], 'https://bbc.invalid'))),
    );

    const result = await fetchHeadlines(
      [
        { url: NYT, name: 'NYT' },
        { url: BBC, name: 'BBC' },
      ],
      4,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fresh).toBe(true);
      expect(result.data.map((i) => i.title)).toEqual(['n1', 'b1', 'n2', 'b2']);
      expect(result.data[0].source).toBe('NYT');
      expect(result.data[1].source).toBe('BBC');
    }

    // Second call should be a cache hit — no network needed.
    server.resetHandlers(); // any new GET would fail loudly
    const second = await fetchHeadlines(
      [
        { url: NYT, name: 'NYT' },
        { url: BBC, name: 'BBC' },
      ],
      4,
    );
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.fresh).toBe(false);
      expect(second.data).toEqual((result as { data: unknown }).data);
    }
  });

  it('one feed fails: still returns the working feed(s)', async () => {
    server.use(
      http.get(NYT, () => HttpResponse.xml(RSS(['n1', 'n2'], 'https://nyt.invalid'))),
      http.get(BBC, () => new HttpResponse(null, { status: 503 })),
    );

    const result = await fetchHeadlines(
      [
        { url: NYT, name: 'NYT' },
        { url: BBC, name: 'BBC' },
      ],
      5,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.map((i) => i.title)).toEqual(['n1', 'n2']);
    }
  });

  it('all feeds fail: returns could-not-load', async () => {
    server.use(
      http.get(NYT, () => new HttpResponse(null, { status: 503 })),
      http.get(BBC, () => new HttpResponse(null, { status: 503 })),
    );

    const result = await fetchHeadlines(
      [
        { url: NYT, name: 'NYT' },
        { url: BBC, name: 'BBC' },
      ],
      5,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/could-not-load/);
    }
  });

  it('empty feed list short-circuits to []', async () => {
    const result = await fetchHeadlines([], 7);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual([]);
  });
});
