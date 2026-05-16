import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

// Mock every fetcher with a synthetic FetchResult. The dispatcher's job is
// just to map widget.type/source → fetcher → component; we're testing that
// wiring, not the fetchers themselves.

vi.mock('@/lib/data/sources/stoic', () => ({
  fetchStoic: () => ({
    ok: true,
    fresh: false,
    data: { body: 'be calm', attribution: 'X', sourceLabel: 'stoic-test' },
  }),
}));
vi.mock('@/lib/data/sources/quote', () => ({
  fetchQuote: async () => ({
    ok: true,
    fresh: true,
    data: { body: 'Q', attribution: 'A', sourceLabel: 'quote-test' },
  }),
}));
vi.mock('@/lib/data/sources/poem', () => ({
  fetchPoem: async () => ({ ok: false, reason: 'down' }),
}));
vi.mock('@/lib/data/sources/onthisday', () => ({
  fetchOnThisDay: async () => ({
    ok: true,
    fresh: true,
    data: { body: 'on-this-day-body', attribution: 'a', sourceLabel: 'wiki' },
  }),
}));
vi.mock('@/lib/data/sources/wikipedia', () => ({
  fetchWikipediaFeatured: async () => ({
    ok: true,
    fresh: true,
    data: { body: 'wiki-body', attribution: 'a', sourceLabel: 'wiki' },
  }),
}));
vi.mock('@/lib/data/sources/word', () => ({
  fetchWord: async () => ({
    ok: true,
    fresh: true,
    data: { body: 'a definition', attribution: 'word', sourceLabel: 'dict' },
  }),
}));
vi.mock('@/lib/data/sources/nasa-apod', () => ({
  fetchNasaApod: async () => ({
    ok: true,
    fresh: true,
    data: {
      image: 'https://nasa.test/i',
      caption: 'NASA caption',
      description: 'd',
      link: 'https://l',
      sourceLabel: 'via NASA',
    },
  }),
}));
vi.mock('@/lib/data/sources/bing-daily', () => ({
  fetchBingDaily: async () => ({
    ok: true,
    fresh: true,
    data: {
      image: 'https://bing.test/i',
      caption: 'Bing caption',
      description: 'd',
      link: 'https://l',
      sourceLabel: 'via Bing',
    },
  }),
}));
vi.mock('@/lib/data/sources/wikimedia-potd', () => ({
  fetchWikimediaPotd: async () => ({
    ok: true,
    fresh: true,
    data: {
      image: 'https://wm.test/i',
      caption: 'WM',
      description: 'd',
      link: 'https://l',
      sourceLabel: 'via WM',
    },
  }),
}));
// Preserve wmoDescription (used by the Weather component) — merge with actual.
vi.mock('@/lib/data/sources/weather', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    fetchWeather: async () => ({
      ok: true,
      fresh: true,
      data: {
        current: { tempF: 70, feelsLikeF: 72, code: 0, humidity: 50, windMph: 5 },
        today: {
          highF: 75,
          lowF: 55,
          sunrise: '2026-05-15T06:00',
          sunset: '2026-05-15T19:00',
          uvMax: 6,
          precipMaxPct: 0,
        },
        forecast: [],
      },
    }),
  };
});
vi.mock('@/lib/data/sources/headlines', () => ({
  fetchHeadlines: async () => ({
    ok: true,
    fresh: true,
    data: [{ title: 'Headline body', link: 'https://x', source: 'NYT' }],
  }),
}));

import { renderWidget } from './render-widget';
import type { Widget } from '@/lib/config';

describe('renderWidget', () => {
  it('text/stoic — sync, no network', async () => {
    const w: Widget = {
      type: 'text',
      title: 'S',
      color: 'violet',
      icon: '◆',
      span: 1,
      source: 'stoic',
    };
    const { container } = render(await renderWidget(w));
    expect(container.textContent).toContain('be calm');
  });

  it('text/quote — async fetcher result', async () => {
    const w: Widget = {
      type: 'text',
      title: 'Q',
      color: 'amber',
      icon: '❝',
      span: 1,
      source: 'quote',
    };
    const { container } = render(await renderWidget(w));
    expect(container.textContent).toContain('quote-test');
  });

  it('text/poem — failure renders could-not-load', async () => {
    const w: Widget = {
      type: 'text',
      title: 'P',
      color: 'rose',
      icon: '¶',
      span: 2,
      source: 'poem',
    };
    const { container } = render(await renderWidget(w));
    expect(container.textContent).toContain('could not load');
  });

  it('image/nasa-apod', async () => {
    const w: Widget = {
      type: 'image',
      title: 'N',
      color: 'blue',
      icon: '✦',
      span: 2,
      source: 'nasa-apod',
    };
    const { container } = render(await renderWidget(w));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://nasa.test/i');
  });

  it('image/static — uses config inline; no fetch', async () => {
    const w: Widget = {
      type: 'image',
      title: 'Static',
      color: 'cyan',
      icon: '✦',
      span: 2,
      source: 'static',
      url: 'https://example.com/static.jpg',
      caption: 'sc',
    };
    const { container } = render(await renderWidget(w));
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://example.com/static.jpg',
    );
  });

  it('weather', async () => {
    const w: Widget = {
      type: 'weather',
      title: 'W',
      color: 'blue',
      icon: '◈',
      span: 1,
      lat: 40.71,
      lon: -74.01,
    };
    const { container } = render(await renderWidget(w));
    expect(container.textContent).toContain('70°');
  });

  it('headlines', async () => {
    const w: Widget = {
      type: 'headlines',
      title: 'H',
      color: 'amber',
      icon: '▤',
      span: 1,
      count: 5,
      feeds: [{ url: 'https://r.example.com', name: 'NYT' }],
    };
    const { container } = render(await renderWidget(w));
    expect(container.textContent).toContain('Headline body');
  });

  it('links — config-only, no data', async () => {
    const w: Widget = {
      type: 'links',
      title: 'L',
      color: 'amber',
      icon: '◑',
      span: 1,
      links: [{ name: 'X', url: 'https://x.com' }],
    };
    const { container } = render(await renderWidget(w));
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://x.com');
  });
});
