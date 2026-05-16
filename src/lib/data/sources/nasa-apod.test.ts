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

import { fetchNasaApod } from './nasa-apod';

const APOD = 'https://api.nasa.gov/planetary/apod';

beforeEach(() => {
  kvStore.clear();
  server.resetHandlers();
});

describe('fetchNasaApod', () => {
  it('maps an image-day APOD into an ImageItem (prefers hdurl over url)', async () => {
    server.use(
      http.get(APOD, () =>
        HttpResponse.json({
          url: 'https://apod.nasa.gov/apod.jpg',
          hdurl: 'https://apod.nasa.gov/apod-hd.jpg',
          title: 'The Veil Nebula',
          explanation: 'Long, long ago, in a galaxy not so far away. ' + 'x'.repeat(500),
          media_type: 'image',
        }),
      ),
    );

    const res = await fetchNasaApod();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.image).toBe('https://apod.nasa.gov/apod-hd.jpg'); // prefers hdurl
      expect(res.data.caption).toBe('The Veil Nebula');
      expect(res.data.description.length).toBeLessThanOrEqual(121); // truncated + …
      expect(res.data.description.endsWith('…')).toBe(true);
      expect(res.data.sourceLabel).toBe('via NASA APOD API');
    }
  });

  it('treats media_type=video as could-not-load (no current image)', async () => {
    server.use(
      http.get(APOD, () =>
        HttpResponse.json({
          url: 'https://youtube.com/embed/x',
          title: 'A cool video',
          explanation: 'x',
          media_type: 'video',
        }),
      ),
    );

    const res = await fetchNasaApod();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/apod-is-video|could-not-load/);
  });

  it('upstream 503 → could-not-load', async () => {
    server.use(http.get(APOD, () => new HttpResponse(null, { status: 503 })));
    const res = await fetchNasaApod();
    expect(res.ok).toBe(false);
  });
});
