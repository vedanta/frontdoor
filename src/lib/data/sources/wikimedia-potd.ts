/**
 * Wikimedia Picture of the Day. Uses the Wikipedia featured-feed endpoint
 * which also serves today's featured article (TFA — used by ./wikipedia.ts).
 *
 *   GET https://en.wikipedia.org/api/rest_v1/feed/featured/{YYYY}/{MM}/{DD}
 *
 * Response contains `image: { title, thumbnail, description, file_page }`.
 *
 * No API key. Per design/04-data-sources.md.
 */
import { fetchUpstream } from '../fetch';
import { withResilience } from '../resilience';
import { formatDate, sourceKey } from '@/lib/kv';
import type { FetchResult } from '../types';
import type { ImageItem } from './types';
import { truncate, yesterday } from './util';

type FeaturedFeed = {
  image?: {
    title?: string;
    thumbnail?: { source?: string };
    description?: { text?: string };
    file_page?: string;
  };
};

function featuredUrl(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `https://en.wikipedia.org/api/rest_v1/feed/featured/${y}/${m}/${day}`;
}

/** Strip `File:` prefix and the file extension. */
function cleanFileTitle(title: string): string {
  return title.replace(/^File:/, '').replace(/\.[A-Za-z0-9]+$/, '');
}

export async function fetchWikimediaPotd(): Promise<FetchResult<ImageItem>> {
  const today = formatDate();

  return withResilience<ImageItem>(sourceKey('wikimedia-potd', today), {
    staleFallbackKey: sourceKey('wikimedia-potd', yesterday()),
    fetcher: async (): Promise<FetchResult<ImageItem>> => {
      const res = await fetchUpstream<FeaturedFeed>(featuredUrl());
      if (!res.ok) return { ok: false, reason: res.reason };

      const img = res.data.image;
      if (!img?.thumbnail?.source) {
        return { ok: false, reason: 'wikimedia-no-image-today' };
      }

      return {
        ok: true,
        fresh: true,
        data: {
          image: img.thumbnail.source,
          caption: cleanFileTitle(img.title ?? ''),
          description: truncate(img.description?.text ?? '', 120),
          link: img.file_page ?? '',
          sourceLabel: 'via Wikimedia POTD',
        },
      };
    },
  });
}
