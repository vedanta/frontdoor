import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../mocks/server';

const kvStore = new Map<string, unknown>();
const fakeRedis = {
  get: async <T>(k: string): Promise<T | null> => (kvStore.get(k) as T | undefined) ?? null,
  set: async (k: string, v: unknown): Promise<'OK'> => {
    kvStore.set(k, v);
    return 'OK';
  },
};

vi.mock('@/lib/kv', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getRedis: () => fakeRedis };
});

import { fetchBingDaily } from './bing-daily';

const BING = 'https://www.bing.com/HPImageArchive.aspx';

beforeEach(() => {
  kvStore.clear();
  server.resetHandlers();
});

describe('fetchBingDaily', () => {
  it('prepends https://www.bing.com to the relative img url', async () => {
    server.use(
      http.get(BING, () =>
        HttpResponse.json({
          images: [
            {
              url: '/th?id=OHR.test.jpg',
              title: "Today's image",
              copyright: 'Photographer (Some Agency)',
              copyrightlink: 'https://www.bing.com/?',
            },
          ],
        }),
      ),
    );

    const res = await fetchBingDaily();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.image).toBe('https://www.bing.com/th?id=OHR.test.jpg');
      expect(res.data.caption).toBe("Today's image");
      expect(res.data.sourceLabel).toBe('via Bing');
    }
  });

  it('empty images array → could-not-load', async () => {
    server.use(http.get(BING, () => HttpResponse.json({ images: [] })));
    const res = await fetchBingDaily();
    expect(res.ok).toBe(false);
  });
});
