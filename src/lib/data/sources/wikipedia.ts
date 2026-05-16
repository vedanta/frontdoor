/**
 * Wikipedia featured article (TFA — today's featured article). Same endpoint
 * as ./wikimedia-potd.ts; we extract `tfa` instead of `image`.
 *
 *   GET https://en.wikipedia.org/api/rest_v1/feed/featured/{YYYY}/{MM}/{DD}
 *
 * No API key. Per design/04-data-sources.md.
 */
import { fetchUpstream } from '../fetch';
import { withResilience } from '../resilience';
import { formatDate, sourceKey } from '@/lib/kv';
import type { FetchResult } from '../types';
import type { TextItem } from './types';
import { truncate, yesterday } from './util';

type FeaturedFeed = {
  tfa?: {
    extract?: string;
    normalizedtitle?: string;
    content_urls?: { desktop?: { page?: string } };
  };
};

function featuredUrl(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `https://en.wikipedia.org/api/rest_v1/feed/featured/${y}/${m}/${day}`;
}

export async function fetchWikipediaFeatured(): Promise<FetchResult<TextItem>> {
  const today = formatDate();

  return withResilience<TextItem>(sourceKey('wikipedia', today), {
    staleFallbackKey: sourceKey('wikipedia', yesterday()),
    fetcher: async (): Promise<FetchResult<TextItem>> => {
      const res = await fetchUpstream<FeaturedFeed>(featuredUrl());
      if (!res.ok) return { ok: false, reason: res.reason };

      const tfa = res.data.tfa;
      if (!tfa?.extract || !tfa?.normalizedtitle) {
        return { ok: false, reason: 'wikipedia-no-featured-today' };
      }

      return {
        ok: true,
        fresh: true,
        data: {
          body: truncate(tfa.extract, 200),
          attribution: tfa.normalizedtitle,
          link: tfa.content_urls?.desktop?.page,
          sourceLabel: 'via Wikipedia',
        },
      };
    },
  });
}
