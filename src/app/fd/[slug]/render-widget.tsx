/**
 * Per-widget render dispatcher. Maps a `Widget` config to its rendered RSC,
 * awaiting whatever data fetch the widget type needs.
 *
 * Lifted out of `page.tsx` so it can be unit-tested in isolation.
 *
 * Each fetcher already returns a `FetchResult` (never throws), so the data
 * unwrap `r.ok ? r.data : null` is enough — `<XWidget data={null}>` renders
 * the quiet `could-not-load` placeholder.
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
import type { ImageItem, TextItem, WeatherData } from '@/lib/data/sources/types';
import type { HeadlineItem } from '@/lib/data/sources/headlines';

/** Unwrap a FetchResult to `data | null`. */
function unwrap<T>(r: { ok: true; data: T } | { ok: false }): T | null {
  return r.ok ? r.data : null;
}

export async function renderWidget(widget: Widget): Promise<React.JSX.Element> {
  switch (widget.type) {
    case 'links':
      return <LinksWidget widget={widget} />;

    case 'launcher':
      return <LauncherWidget widget={widget} />;

    case 'text': {
      let data: TextItem | null = null;
      switch (widget.source) {
        case 'stoic':
          data = unwrap(fetchStoic());
          break;
        case 'quote':
          data = unwrap(await fetchQuote());
          break;
        case 'poem':
          data = unwrap(await fetchPoem());
          break;
        case 'onthisday':
          data = unwrap(await fetchOnThisDay());
          break;
        case 'wikipedia':
          data = unwrap(await fetchWikipediaFeatured());
          break;
        case 'word':
          data = unwrap(await fetchWord());
          break;
      }
      return <TextWidget widget={widget} data={data} />;
    }

    case 'image': {
      if (widget.source === 'static') {
        return <ImageWidget widget={widget} />;
      }
      let data: ImageItem | null = null;
      switch (widget.source) {
        case 'nasa-apod':
          data = unwrap(await fetchNasaApod());
          break;
        case 'bing-daily':
          data = unwrap(await fetchBingDaily());
          break;
        case 'wikimedia-potd':
          data = unwrap(await fetchWikimediaPotd());
          break;
      }
      return <ImageWidget widget={widget} data={data} />;
    }

    case 'weather': {
      const data: WeatherData | null = unwrap(await fetchWeather(widget.lat, widget.lon));
      return <WeatherWidget widget={widget} data={data} />;
    }

    case 'headlines': {
      const data: HeadlineItem[] | null = unwrap(await fetchHeadlines(widget.feeds, widget.count));
      return <HeadlinesWidget widget={widget} data={data} />;
    }
  }
}
