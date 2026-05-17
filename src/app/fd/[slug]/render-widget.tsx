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

/** Unwrap a FetchResult to `{ data, fetchedAt }`; failure → both null. */
function unwrap<T>(r: FetchResult<T>): { data: T | null; fetchedAt: string | null } {
  if (r.ok) return { data: r.data, fetchedAt: r.fetchedAt ?? null };
  return { data: null, fetchedAt: null };
}

export async function renderWidget(widget: Widget): Promise<React.JSX.Element> {
  switch (widget.type) {
    case 'links':
      return <LinksWidget widget={widget} />;

    case 'launcher':
      return <LauncherWidget widget={widget} />;

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
      return <TextWidget widget={widget} data={unwrapped.data} fetchedAt={unwrapped.fetchedAt} />;
    }

    case 'image': {
      if (widget.source === 'static') {
        return <ImageWidget widget={widget} />;
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
      return <ImageWidget widget={widget} data={unwrapped.data} fetchedAt={unwrapped.fetchedAt} />;
    }

    case 'weather': {
      // Weather + headlines don't currently render the stale caption — both
      // have parameterized cache keys (per-location / per-feed-set hash) and
      // their own freshness semantics. Defer per #81 body.
      const { data } = unwrap(await fetchWeather(widget.lat, widget.lon));
      return <WeatherWidget widget={widget} data={data} />;
    }

    case 'headlines': {
      const { data } = unwrap(await fetchHeadlines(widget.feeds, widget.count));
      return <HeadlinesWidget widget={widget} data={data} />;
    }
  }
}
