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

import { fetchQuote } from './quote';

beforeEach(() => {
  kvStore.clear();
  server.resetHandlers();
});

describe('fetchQuote', () => {
  it('maps ZenQuotes response to TextItem', async () => {
    server.use(
      http.get('https://zenquotes.io/api/today', () =>
        HttpResponse.json([{ q: 'Be kind', a: 'Anon' }]),
      ),
    );
    const res = await fetchQuote();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.body).toBe('Be kind');
      expect(res.data.attribution).toBe('Anon');
      expect(res.data.sourceLabel).toBe('via zenquotes.io');
    }
  });

  it('empty response → could-not-load', async () => {
    server.use(http.get('https://zenquotes.io/api/today', () => HttpResponse.json([])));
    const res = await fetchQuote();
    expect(res.ok).toBe(false);
  });
});
