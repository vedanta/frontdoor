import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

// Mock the KV: configKey:{userId} → DEFAULT_CONFIG
const kvStore = new Map<string, unknown>();
const fakeRedis = {
  // Trailing comma in <T,> disambiguates the generic from JSX in .tsx files.
  get: async <T,>(k: string): Promise<T | null> => (kvStore.has(k) ? (kvStore.get(k) as T) : null),
};

vi.mock('@/lib/kv', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getRedis: () => fakeRedis };
});

// Mock the auth session
let mockSession: { userId: string; slug: string } | null = null;
vi.mock('@/lib/auth', () => ({
  getSessionFromCookie: async () => mockSession,
}));

// Mock notFound — Next normally throws and the framework handles it.
// In test, we replace it with a sentinel error so we can assert on it.
// useRouter is also stubbed (transitively needed by <UseMyLocation/> #105).
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
}));

// Mock next/headers — page.tsx reads Vercel edge geo via `headers()` (#105).
// Per-test override via `mockEdgeHeaders.headers = {...}`; default is empty
// (no edge geo present → resolveLocation falls through to fallback).
const mockEdgeHeaders: { headers: Record<string, string> } = { headers: {} };
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) => mockEdgeHeaders.headers[name.toLowerCase()] ?? null,
  }),
}));

// Mock all the fetchers so the page renders deterministically.
vi.mock('@/lib/data/sources/stoic', () => ({
  fetchStoic: () => ({
    ok: true,
    fresh: false,
    data: { body: 'stoic body', attribution: 'Sage', sourceLabel: 's' },
  }),
}));
vi.mock('@/lib/data/sources/quote', () => ({
  fetchQuote: async () => ({
    ok: true,
    fresh: true,
    data: { body: 'Q', attribution: 'A', sourceLabel: 'q' },
  }),
}));
vi.mock('@/lib/data/sources/poem', () => ({
  fetchPoem: async () => ({
    ok: true,
    fresh: true,
    data: { body: 'P\nline2', attribution: 'A', sourceLabel: 'p' },
  }),
}));
vi.mock('@/lib/data/sources/onthisday', () => ({
  fetchOnThisDay: async () => ({
    ok: true,
    fresh: true,
    data: { body: 'event', attribution: 'OTD', sourceLabel: 'o' },
  }),
}));
vi.mock('@/lib/data/sources/wikipedia', () => ({
  fetchWikipediaFeatured: async () => ({
    ok: true,
    fresh: true,
    data: { body: 'wiki', attribution: 'W', sourceLabel: 'w' },
  }),
}));
vi.mock('@/lib/data/sources/word', () => ({
  fetchWord: async () => ({
    ok: true,
    fresh: true,
    data: { body: 'def', attribution: 'word', sourceLabel: 'd' },
  }),
}));
vi.mock('@/lib/data/sources/nasa-apod', () => ({
  fetchNasaApod: async () => ({
    ok: true,
    fresh: true,
    data: {
      image: 'https://nasa',
      caption: 'N',
      description: '',
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
      image: 'https://bing',
      caption: 'B',
      description: '',
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
      image: 'https://wm',
      caption: 'WM',
      description: '',
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
    data: [{ title: 'H1', link: 'https://h', source: 'NYT' }],
  }),
}));

import DashboardPage from './page';
import { configKey } from '@/lib/kv';
import { DEFAULT_CONFIG } from '@/lib/config';

beforeEach(() => {
  kvStore.clear();
  mockSession = null;
});

describe('DashboardPage', () => {
  it('no session → notFound', async () => {
    await expect(DashboardPage({ params: Promise.resolve({ slug: 'x' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });

  it('session but no config in KV → notFound', async () => {
    mockSession = { userId: 'u_1', slug: 'devdev01' };
    await expect(DashboardPage({ params: Promise.resolve({ slug: 'devdev01' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });

  it('renders the dashboard with all 6 sections from DEFAULT_CONFIG', async () => {
    mockSession = { userId: 'u_1', slug: 'devdev01' };
    kvStore.set(configKey('u_1'), DEFAULT_CONFIG);
    const result = await DashboardPage({ params: Promise.resolve({ slug: 'devdev01' }) });
    const { container } = render(result);
    // All 6 section dividers should be present
    const dividers = container.querySelectorAll('.section-divider-title');
    expect(dividers.length).toBe(6);
    // The slug shows in the tagline
    expect(container.textContent).toContain('/fd/devdev01');
    // Stoic body — proves data fetching reached one widget
    expect(container.textContent).toContain('stoic body');
  });

  it('uses session.userId (not the url slug) for the config lookup', async () => {
    mockSession = { userId: 'u_real', slug: 'devdev01' };
    kvStore.set(configKey('u_real'), DEFAULT_CONFIG);
    // Even though we pass a different slug in the URL, page reads via session.userId.
    // (Middleware enforces slug match in prod; here we just verify the lookup uses userId.)
    const result = await DashboardPage({ params: Promise.resolve({ slug: 'wrong-slug' }) });
    const { container } = render(result);
    expect(container.querySelectorAll('.section-divider-title').length).toBe(6);
  });

  it('renders the StatusBar colophon (#67): dev version + day/week + moon + sunset', async () => {
    mockSession = { userId: 'u_1', slug: 'devdev01' };
    kvStore.set(configKey('u_1'), DEFAULT_CONFIG);
    const result = await DashboardPage({ params: Promise.resolve({ slug: 'devdev01' }) });
    const { container } = render(result);

    const sb = container.querySelector('.statusbar');
    expect(sb).toBeInTheDocument();

    // NODE_ENV is 'test' under vitest → getVersion() returns 'dev' (no link).
    expect(sb?.querySelector('a.status-link')).not.toBeInTheDocument();
    expect(sb?.textContent).toContain('dev');

    // Day-of-year + ISO week pattern (real date — don't pin to a number).
    expect(sb?.textContent).toMatch(/day \d+ · week \d+/);

    // One of the 8 moon emojis must be present.
    const moonChars = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
    expect(moonChars.some((c) => sb?.textContent?.includes(c))).toBe(true);

    // Weather mock returns sunrise '2026-05-15T06:00' → '06:00' and
    // sunset '2026-05-15T19:00' → '19:00'.
    expect(sb?.textContent).toContain('↑ 06:00');
    expect(sb?.textContent).toContain('↓ 19:00');

    // Stale chunk hidden — mocks don't carry `fetchedAt`, so all widgets
    // resolve to null and the count is 0 (< the threshold of 2).
    expect(sb?.textContent).not.toContain('stale');

    // FontControls embedded.
    expect(sb?.querySelector('.status-fontsize')).toBeInTheDocument();
  });
});
