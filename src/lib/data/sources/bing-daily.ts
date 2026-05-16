/**
 * Bing daily image.
 *
 *   GET https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-US
 *
 * Response: `{ images: [{ url, title, copyright, copyrightlink }] }`.
 * `img.url` is relative; prepend `https://www.bing.com`.
 *
 * No API key. Per design/04-data-sources.md.
 */
import { fetchUpstream } from '../fetch';
import { withResilience } from '../resilience';
import { formatDate, sourceKey } from '@/lib/kv';
import type { FetchResult } from '../types';
import type { ImageItem } from './types';
import { truncate, yesterday } from './util';

type BingResponse = {
  images?: Array<{
    url: string;
    title?: string;
    copyright?: string;
    copyrightlink?: string;
  }>;
};

export async function fetchBingDaily(): Promise<FetchResult<ImageItem>> {
  const today = formatDate();

  return withResilience<ImageItem>(sourceKey('bing-daily', today), {
    staleFallbackKey: sourceKey('bing-daily', yesterday()),
    fetcher: async (): Promise<FetchResult<ImageItem>> => {
      const res = await fetchUpstream<BingResponse>(
        'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-US',
      );
      if (!res.ok) return { ok: false, reason: res.reason };

      const img = res.data.images?.[0];
      if (!img) return { ok: false, reason: 'bing-empty-images' };

      return {
        ok: true,
        fresh: true,
        data: {
          image: `https://www.bing.com${img.url}`,
          caption: img.title ?? '',
          description: truncate(img.copyright ?? '', 120),
          link: img.copyrightlink ?? '',
          sourceLabel: 'via Bing',
        },
      };
    },
  });
}
