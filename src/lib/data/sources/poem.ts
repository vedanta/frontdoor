/**
 * Random poem. PoetryDB — no API key.
 *   GET https://poetrydb.org/random/1  →  [{ title, author, lines[] }]
 *
 * Take first 8 lines; append `\n…` if truncated.
 */
import { fetchUpstream } from '../fetch';
import { withResilience } from '../resilience';
import { formatDate, sourceKey } from '@/lib/kv';
import type { FetchResult } from '../types';
import type { TextItem } from './types';
import { yesterday } from './util';

const MAX_LINES = 8;

type PoemResponse = Array<{ title: string; author: string; lines: string[] }>;

export async function fetchPoem(): Promise<FetchResult<TextItem>> {
  const today = formatDate();

  return withResilience<TextItem>(sourceKey('poem', today), {
    staleFallbackKey: sourceKey('poem', yesterday()),
    fetcher: async (): Promise<FetchResult<TextItem>> => {
      const res = await fetchUpstream<PoemResponse>('https://poetrydb.org/random/1');
      if (!res.ok) return { ok: false, reason: res.reason };

      const poem = res.data?.[0];
      if (!poem?.lines || poem.lines.length === 0) {
        return { ok: false, reason: 'poetrydb-empty' };
      }

      const truncated = poem.lines.length > MAX_LINES;
      const body = poem.lines.slice(0, MAX_LINES).join('\n') + (truncated ? '\n…' : '');

      return {
        ok: true,
        fresh: true,
        data: {
          body,
          attribution: `${poem.author} — "${poem.title}"`,
          sourceLabel: 'via PoetryDB',
        },
      };
    },
  });
}
