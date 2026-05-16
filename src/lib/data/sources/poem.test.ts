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

import { fetchPoem } from './poem';

beforeEach(() => {
  kvStore.clear();
  server.resetHandlers();
});

describe('fetchPoem', () => {
  it('truncates poems longer than 8 lines and appends "…"', async () => {
    const lines = Array.from({ length: 12 }, (_, i) => `Line ${i + 1}`);
    server.use(
      http.get('https://poetrydb.org/random/1', () =>
        HttpResponse.json([{ title: 'A Poem', author: 'Anon', lines }]),
      ),
    );

    const res = await fetchPoem();
    expect(res.ok).toBe(true);
    if (res.ok) {
      const bodyLines = res.data.body.split('\n');
      expect(bodyLines.length).toBe(9); // 8 lines + the "…"
      expect(bodyLines.at(-1)).toBe('…');
      expect(res.data.attribution).toBe('Anon — "A Poem"');
    }
  });

  it('preserves short poems verbatim (no "…")', async () => {
    server.use(
      http.get('https://poetrydb.org/random/1', () =>
        HttpResponse.json([{ title: 'Short', author: 'Anon', lines: ['One', 'Two'] }]),
      ),
    );

    const res = await fetchPoem();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.body).toBe('One\nTwo');
    }
  });

  it('empty response → could-not-load', async () => {
    server.use(http.get('https://poetrydb.org/random/1', () => HttpResponse.json([])));
    const res = await fetchPoem();
    expect(res.ok).toBe(false);
  });
});
