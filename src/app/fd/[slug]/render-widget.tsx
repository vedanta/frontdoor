/**
 * Per-widget render dispatcher. Maps a `Widget` config to its rendered RSC,
 * awaiting whatever data fetch the widget type needs.
 *
 * Lifted out of `page.tsx` so it can be unit-tested in isolation.
 *
 * Each fetcher already returns a `FetchResult` (never throws). `unwrap`
 * returns `{ data, fetchedAt }`; widgets show a placeholder/caption when
 * data is null, and show the exception-only stale caption (#81b) when
 * fetchedAt is older than today.
 *
 * Return shape (#67): `{ element, fetchedAt }`. `fetchedAt` is bubbled up
 * so `page.tsx` can aggregate the stale-widget count for the StatusBar
 * (≥ 2 stale → renders a `N widgets stale` chunk) without re-running every
 * fetcher. Static widgets (`links`, `launcher`, `image source: static`)
 * return `fetchedAt: null` — they aren't time-anchored, so they never
 * contribute to the stale count.
 */
import type { Widget } from '@/lib/config';
import {
  HeadlinesWidget,
  ImageWidget,
  LauncherWidget,
  LinksWidget,
  TextWidget,
  WeatherWidget,
} from '@/components/widgets';
import { fetchBingDaily } from '@/lib/data/sources/bing-daily';
import { fetchHeadlines } from '@/lib/data/sources/headlines';
import { fetchNasaApod } from '@/lib/data/sources/nasa-apod';
import { fetchOnThisDay } from '@/lib/data/sources/onthisday';
import { fetchPoem } from '@/lib/data/sources/poem';
import { fetchQuote } from '@/lib/data/sources/quote';
import { fetchStoic } from '@/lib/data/sources/stoic';
import { fetchWeather } from '@/lib/data/sources/weather';
import { fetchWikimediaPotd } from '@/lib/data/sources/wikimedia-potd';
import { fetchWikipediaFeatured } from '@/lib/data/sources/wikipedia';
import { fetchWord } from '@/lib/data/sources/word';
import type { FetchResult } from '@/lib/data/types';
import type { ImageItem, TextItem } from '@/lib/data/sources/types';

export type RenderedWidget = {
  element: React.JSX.Element;
  /** UTC date (YYYY-MM-DD) of the cache hit; null for static/non-data widgets. */
  fetchedAt: string | null;
};

/** Unwrap a FetchResult to `{ data, fetchedAt }`; failure → both null. */
function unwrap<T>(r: FetchResult<T>): { data: T | null; fetchedAt: string | null } {
  if (r.ok) return { data: r.data, fetchedAt: r.fetchedAt ?? null };
  return { data: null, fetchedAt: null };
}

export async function renderWidget(widget: Widget): Promise<RenderedWidget> {
  switch (widget.type) {
    case 'links':
      return { element: <LinksWidget widget={widget} />, fetchedAt: null };

    case 'launcher':
      return { element: <LauncherWidget widget={widget} />, fetchedAt: null };

    case 'text': {
      let unwrapped: { data: TextItem | null; fetchedAt: string | null } = {
        data: null,
        fetchedAt: null,
      };
      switch (widget.source) {
        case 'stoic':
          unwrapped = unwrap(fetchStoic());
          break;
        case 'quote':
          unwrapped = unwrap(await fetchQuote());
          break;
        case 'poem':
          unwrapped = unwrap(await fetchPoem());
          break;
        case 'onthisday':
          unwrapped = unwrap(await fetchOnThisDay());
          break;
        case 'wikipedia':
          unwrapped = unwrap(await fetchWikipediaFeatured());
          break;
        case 'word':
          unwrapped = unwrap(await fetchWord());
          break;
      }
      return {
        element: (
          <TextWidget widget={widget} data={unwrapped.data} fetchedAt={unwrapped.fetchedAt} />
        ),
        fetchedAt: unwrapped.fetchedAt,
      };
    }

    case 'image': {
      if (widget.source === 'static') {
        return { element: <ImageWidget widget={widget} />, fetchedAt: null };
      }
      let unwrapped: { data: ImageItem | null; fetchedAt: string | null } = {
        data: null,
        fetchedAt: null,
      };
      switch (widget.source) {
        case 'nasa-apod':
          unwrapped = unwrap(await fetchNasaApod());
          break;
        case 'bing-daily':
          unwrapped = unwrap(await fetchBingDaily());
          break;
        case 'wikimedia-potd':
          unwrapped = unwrap(await fetchWikimediaPotd());
          break;
      }
      return {
        element: (
          <ImageWidget widget={widget} data={unwrapped.data} fetchedAt={unwrapped.fetchedAt} />
        ),
        fetchedAt: unwrapped.fetchedAt,
      };
    }

    case 'weather': {
      const { data, fetchedAt } = unwrap(await fetchWeather(widget.lat, widget.lon));
      return {
        element: <WeatherWidget widget={widget} data={data} fetchedAt={fetchedAt} />,
        fetchedAt,
      };
    }

    case 'headlines': {
      const { data, fetchedAt } = unwrap(await fetchHeadlines(widget.feeds, widget.count));
      return {
        element: <HeadlinesWidget widget={widget} data={data} fetchedAt={fetchedAt} />,
        fetchedAt,
      };
    }
  }
}
