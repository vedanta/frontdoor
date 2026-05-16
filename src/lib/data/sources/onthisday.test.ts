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

import { fetchOnThisDay } from './onthisday';

beforeEach(() => {
  kvStore.clear();
  server.resetHandlers();
});

describe('fetchOnThisDay', () => {
  it('picks 2 events spread across the list and formats them', async () => {
    const events = Array.from({ length: 10 }, (_, i) => ({
      year: 1900 + i,
      text: `Event #${i}`,
    }));
    server.use(
      http.get('https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/*', () =>
        HttpResponse.json({ events }),
      ),
    );

    const res = await fetchOnThisDay(new Date('2026-05-15T12:00:00Z'));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.body).toContain('1900 — Event #0');
      // step = floor(10/2) = 5 → second pick is index 5
      expect(res.data.body).toContain('1905 — Event #5');
      expect(res.data.attribution).toBe('On this day — May 15');
      expect(res.data.sourceLabel).toBe('via Wikipedia');
    }
  });

  it('handles a single event (no second pick)', async () => {
    server.use(
      http.get('https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/*', () =>
        HttpResponse.json({ events: [{ year: 2000, text: 'Only event' }] }),
      ),
    );

    const res = await fetchOnThisDay(new Date('2026-05-15T12:00:00Z'));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.body).toBe('2000 — Only event');
    }
  });

  it('empty events → could-not-load', async () => {
    server.use(
      http.get('https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/*', () =>
        HttpResponse.json({ events: [] }),
      ),
    );
    const res = await fetchOnThisDay();
    expect(res.ok).toBe(false);
  });
});
