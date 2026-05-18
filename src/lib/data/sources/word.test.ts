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

import { fetchWord, pickWord, WORDS } from './word';

beforeEach(() => {
  kvStore.clear();
  server.resetHandlers();
});

describe('pickWord', () => {
  it('is deterministic by day', () => {
    const d = new Date('2026-05-15T12:00:00Z');
    expect(pickWord(d)).toEqual(pickWord(d));
  });

  it('cycles through the WORDS list — every entry can be picked', () => {
    // Probe ~600 days; verify we see every word
    const seen = new Set<string>();
    for (let i = 0; i < WORDS.length * 3; i++) {
      const d = new Date(2026, 0, i + 1);
      seen.add(pickWord(d).word);
    }
    expect(seen.size).toBe(WORDS.length);
  });

  it('every WORDS entry has a non-empty definition (#87 offline data integrity)', () => {
    for (const entry of WORDS) {
      expect(entry.word).toMatch(/^[a-z]+$/);
      expect(entry.partOfSpeech).toMatch(/^(noun|verb|adjective|adverb)$/);
      expect(entry.definition.length).toBeGreaterThan(10);
    }
  });
});

describe('fetchWord', () => {
  it('maps the dictionary response to TextItem (upstream success path)', async () => {
    server.use(
      http.get('https://api.dictionaryapi.dev/api/v2/entries/en/*', () =>
        HttpResponse.json([
          {
            phonetic: '/ˈtɛst/',
            meanings: [
              {
                partOfSpeech: 'noun',
                definitions: [{ definition: 'a procedure intended to establish quality' }],
              },
            ],
          },
        ]),
      ),
    );

    const res = await fetchWord(new Date('2026-05-15T12:00:00Z'));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.body).toBe('a procedure intended to establish quality');
      expect(res.data.attribution).toMatch(/\(noun\)/);
      expect(res.data.attribution).toMatch(/\/ˈtɛst\//);
      expect(res.data.sourceLabel).toBe('via Free Dictionary API');
      expect(res.data.offline).toBeUndefined(); // upstream success → no offline flag
    }
  });

  it('upstream failure → offline fallback with offline=true marker (#87)', async () => {
    server.use(
      http.get('https://api.dictionaryapi.dev/api/v2/entries/en/*', () => HttpResponse.error()),
    );

    const date = new Date('2026-05-15T12:00:00Z');
    const expected = pickWord(date);
    const res = await fetchWord(date);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.body).toBe(expected.definition);
      expect(res.data.attribution).toBe(`${expected.word} (${expected.partOfSpeech})`);
      expect(res.data.sourceLabel).toBe('offline word list');
      expect(res.data.offline).toBe(true);
    }
  });

  it('upstream returned but no usable definition → also falls back to offline (#87)', async () => {
    server.use(
      http.get('https://api.dictionaryapi.dev/api/v2/entries/en/*', () => HttpResponse.json([])),
    );
    const date = new Date('2026-05-15T12:00:00Z');
    const expected = pickWord(date);
    const res = await fetchWord(date);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.offline).toBe(true);
      expect(res.data.body).toBe(expected.definition);
    }
  });
});
