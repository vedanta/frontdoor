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

import { fetchWikimediaPotd } from './wikimedia-potd';

beforeEach(() => {
  kvStore.clear();
  server.resetHandlers();
});

describe('fetchWikimediaPotd', () => {
  it('strips File: prefix and extension from the caption', async () => {
    server.use(
      http.get('https://en.wikipedia.org/api/rest_v1/feed/featured/*', () =>
        HttpResponse.json({
          image: {
            title: 'File:Beautiful sunset.jpg',
            thumbnail: { source: 'https://upload.wikimedia.org/.../sunset.jpg' },
            description: { text: 'A photograph of a sunset over the ocean.' },
            file_page: 'https://commons.wikimedia.org/wiki/File:Beautiful_sunset.jpg',
          },
        }),
      ),
    );

    const res = await fetchWikimediaPotd();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.caption).toBe('Beautiful sunset');
      expect(res.data.image).toContain('upload.wikimedia.org');
      expect(res.data.link).toContain('commons.wikimedia.org');
      expect(res.data.sourceLabel).toBe('via Wikimedia POTD');
    }
  });

  it('missing image → could-not-load', async () => {
    server.use(
      http.get('https://en.wikipedia.org/api/rest_v1/feed/featured/*', () => HttpResponse.json({})),
    );
    const res = await fetchWikimediaPotd();
    expect(res.ok).toBe(false);
  });
});
