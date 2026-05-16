/**
 * Quote of the day. ZenQuotes — no API key.
 *   GET https://zenquotes.io/api/today  →  [{ q, a }]
 */
import { fetchUpstream } from '../fetch';
import { withResilience } from '../resilience';
import { formatDate, sourceKey } from '@/lib/kv';
import type { FetchResult } from '../types';
import type { TextItem } from './types';
import { yesterday } from './util';

type ZenQuote = { q: string; a: string };

export async function fetchQuote(): Promise<FetchResult<TextItem>> {
  const today = formatDate();

  return withResilience<TextItem>(sourceKey('quote', today), {
    staleFallbackKey: sourceKey('quote', yesterday()),
    fetcher: async (): Promise<FetchResult<TextItem>> => {
      const res = await fetchUpstream<ZenQuote[]>('https://zenquotes.io/api/today');
      if (!res.ok) return { ok: false, reason: res.reason };

      const q = res.data?.[0];
      if (!q?.q) return { ok: false, reason: 'zenquotes-empty' };

      return {
        ok: true,
        fresh: true,
        data: {
          body: q.q,
          attribution: q.a ?? '',
          sourceLabel: 'via zenquotes.io',
        },
      };
    },
  });
}
