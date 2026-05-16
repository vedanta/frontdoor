/**
 * Headlines source — fetches N feeds in parallel, interleaves them, caches
 * the result by a hash of the feed set. The public surface of #6 RSS fetcher;
 * the headlines widget (#12) calls this and renders the items.
 */
import { fetchUpstream } from '../fetch';
import { withResilience } from '../resilience';
import { formatDate, headlinesKey } from '@/lib/kv';
import type { FetchResult } from '../types';
import { feedSetHash, type Feed } from './feed-hash';
import { interleave } from './interleave';
import { parseFeed, type HeadlineItem } from './rss-parse';

export type { Feed, HeadlineItem };

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function fetchHeadlines(
  feeds: Feed[],
  count: number,
): Promise<FetchResult<HeadlineItem[]>> {
  if (feeds.length === 0 || count <= 0) {
    return { ok: true, data: [], fresh: true };
  }

  const hash = await feedSetHash(feeds, count);
  const today = formatDate();
  const yesterday = formatDate(new Date(Date.now() - ONE_DAY_MS));

  return withResilience<HeadlineItem[]>(headlinesKey(hash, today), {
    staleFallbackKey: headlinesKey(hash, yesterday),
    fetcher: async (): Promise<FetchResult<HeadlineItem[]>> => {
      const results = await Promise.allSettled(
        feeds.map(async (feed) => {
          const res = await fetchUpstream<string>(feed.url, { parseAs: 'text' });
          if (!res.ok) return null;
          return parseFeed(res.data, feed.name);
        }),
      );

      const groups: HeadlineItem[][] = [];
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value && r.value.length > 0) {
          groups.push(r.value);
        }
      }

      if (groups.length === 0) {
        return { ok: false, reason: 'all feeds failed or returned empty' };
      }

      return { ok: true, data: interleave(groups, count), fresh: true };
    },
  });
}
