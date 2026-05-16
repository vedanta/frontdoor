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

import { fetchWikipediaFeatured } from './wikipedia';

beforeEach(() => {
  kvStore.clear();
  server.resetHandlers();
});

describe('fetchWikipediaFeatured', () => {
  it('extracts tfa (today’s featured article) and truncates extract to ~200 chars', async () => {
    const longExtract = 'A long article extract. '.repeat(50);
    server.use(
      http.get('https://en.wikipedia.org/api/rest_v1/feed/featured/*', () =>
        HttpResponse.json({
          tfa: {
            extract: longExtract,
            normalizedtitle: 'Some Article',
            content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Some_Article' } },
          },
        }),
      ),
    );

    const res = await fetchWikipediaFeatured();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.body.length).toBeLessThanOrEqual(201); // 200 + …
      expect(res.data.body.endsWith('…')).toBe(true);
      expect(res.data.attribution).toBe('Some Article');
      expect(res.data.link).toBe('https://en.wikipedia.org/wiki/Some_Article');
      expect(res.data.sourceLabel).toBe('via Wikipedia');
    }
  });

  it('missing tfa → could-not-load', async () => {
    server.use(
      http.get('https://en.wikipedia.org/api/rest_v1/feed/featured/*', () => HttpResponse.json({})),
    );
    const res = await fetchWikipediaFeatured();
    expect(res.ok).toBe(false);
  });
});
