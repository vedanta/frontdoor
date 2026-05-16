/**
 * NASA APOD (Astronomy Picture of the Day).
 *
 *   GET https://api.nasa.gov/planetary/apod?api_key={NASA_API_KEY}
 *
 * Quirk: some days the APOD is a video (media_type === 'video'). The fetcher
 * treats that as "no image today" — withResilience falls back to yesterday's
 * cached image automatically.
 *
 * Per design/04-data-sources.md.
 */
import { fetchUpstream } from '../fetch';
import { withResilience } from '../resilience';
import { formatDate, sourceKey } from '@/lib/kv';
import type { FetchResult } from '../types';
import type { ImageItem } from './types';
import { truncate, yesterday } from './util';

type ApodResponse = {
  url: string;
  hdurl?: string;
  title: string;
  explanation: string;
  media_type: 'image' | 'video' | string;
};

export async function fetchNasaApod(): Promise<FetchResult<ImageItem>> {
  const today = formatDate();

  return withResilience<ImageItem>(sourceKey('nasa-apod', today), {
    staleFallbackKey: sourceKey('nasa-apod', yesterday()),
    fetcher: async (): Promise<FetchResult<ImageItem>> => {
      const apiKey = process.env.NASA_API_KEY ?? 'DEMO_KEY';
      const res = await fetchUpstream<ApodResponse>(
        `https://api.nasa.gov/planetary/apod?api_key=${apiKey}`,
      );
      if (!res.ok) return { ok: false, reason: res.reason };

      if (res.data.media_type !== 'image') {
        return { ok: false, reason: 'apod-is-video' };
      }

      return {
        ok: true,
        fresh: true,
        data: {
          image: res.data.hdurl ?? res.data.url,
          caption: res.data.title,
          description: truncate(res.data.explanation, 120),
          link: res.data.url,
          sourceLabel: 'via NASA APOD API',
        },
      };
    },
  });
}
