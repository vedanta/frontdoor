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
import { resolveLocation, type EdgeGeo, type UserLocation } from '@/lib/location';

export type RenderedWidget = {
  element: React.JSX.Element;
  /** UTC date (YYYY-MM-DD) of the cache hit; null for static/non-data widgets. */
  fetchedAt: string | null;
};

/**
 * Resolved environment passed into renderWidget — sources for layered
 * location resolution (#105) and any future per-render context.
 */
export type RenderContext = {
  /** UserRecord-saved location (highest non-override priority). */
  userLocation?: UserLocation;
  /** Vercel edge geo from request headers (fills in when neither widget nor user has coords). */
  edgeGeo?: EdgeGeo;
};

/** Unwrap a FetchResult to `{ data, fetchedAt }`; failure → both null. */
function unwrap<T>(r: FetchResult<T>): { data: T | null; fetchedAt: string | null } {
  if (r.ok) return { data: r.data, fetchedAt: r.fetchedAt ?? null };
  return { data: null, fetchedAt: null };
}

export async function renderWidget(
  widget: Widget,
  ctx: RenderContext = {},
): Promise<RenderedWidget> {
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
      // #105: layered location — widget config (rare per-widget override),
      // UserRecord (the typical user location), Vercel edge geo, or NYC fallback.
      const loc = resolveLocation({
        widget: { lat: widget.lat, lon: widget.lon, city: widget.city },
        user: ctx.userLocation,
        edge: ctx.edgeGeo,
      });
      const { data, fetchedAt } = unwrap(await fetchWeather(loc.lat, loc.lon));
      return {
        element: <WeatherWidget widget={widget} data={data} fetchedAt={fetchedAt} location={loc} />,
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
