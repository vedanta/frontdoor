/**
 * Per-user dashboard placeholder. Middleware (src/middleware.ts) guarantees
 * that the visitor reaches here only with a valid signed cookie whose slug
 * matches the path, so we don't re-check inside the component.
 *
 * Real widget composition with live fetched data is #23. This page renders
 * the same widget-demo content as the pre-auth placeholder did, just behind
 * the cookie gate.
 */
import { DEFAULT_CONFIG } from '@/lib/config';
import { fetchStoic } from '@/lib/data/sources/stoic';
import {
  HeadlinesWidget,
  ImageWidget,
  LauncherWidget,
  LinksWidget,
  SectionDivider,
  TextWidget,
  WeatherWidget,
} from '@/components/widgets';
import { Clock } from '@/components/Clock';
import { SearchBar, buildShortcuts } from '@/components/search';
import { getSessionFromCookie } from '@/lib/auth';

function firstWidgetOfType<T extends string>(type: T) {
  for (const section of DEFAULT_CONFIG.sections) {
    for (const w of section.widgets) {
      if (w.type === type) return w;
    }
  }
  return null;
}

type Props = { params: Promise<{ slug: string }> };

export default async function DashboardPage({ params }: Props) {
  const { slug } = await params;
  const session = await getSessionFromCookie();

  const stoicCfg = firstWidgetOfType('text')!;
  const stoicData = fetchStoic();
  const linksCfg = firstWidgetOfType('links')!;
  const launcherCfg = firstWidgetOfType('launcher')!;
  const headlinesCfg = firstWidgetOfType('headlines')!;
  const weatherCfg = firstWidgetOfType('weather')!;
  const imageCfg = firstWidgetOfType('image')!;
  const shortcuts = buildShortcuts(DEFAULT_CONFIG);

  return (
    <>
      <div className="grid-dots" />
      <div className="shell">
        <header className="header">
          <div className="header-left">
            <span className="logo">
              frontdoor
              <span className="logo-dot" />
            </span>
            <span className="tagline">
              /d/{slug} · auth ok · widgets demo · real composition in #23
            </span>
          </div>
          <div>
            <Clock />
          </div>
        </header>

        <SearchBar shortcuts={shortcuts} />

        <div className="grid">
          <SectionDivider
            id="arrive"
            title="Welcome"
            subtitle={`signed in as ${session?.userId.slice(0, 8) ?? '—'}`}
          />

          {stoicCfg.type === 'text' && stoicData.ok && (
            <TextWidget widget={stoicCfg} data={stoicData.data} />
          )}

          {linksCfg.type === 'links' && <LinksWidget widget={linksCfg} />}

          {imageCfg.type === 'image' && (
            <ImageWidget
              widget={{
                type: 'image',
                title: imageCfg.title,
                color: imageCfg.color,
                icon: imageCfg.icon,
                span: 2,
                source: 'static',
                url: 'https://images.unsplash.com/photo-1532978879514-6f57086c8430?w=600',
                caption: 'A still moment',
                description:
                  'Static placeholder. Real daily-image fetchers are wired; #23 calls them.',
              }}
            />
          )}

          {weatherCfg.type === 'weather' && (
            <WeatherWidget
              widget={weatherCfg}
              data={{
                current: { tempF: 68, feelsLikeF: 70, code: 2, humidity: 55, windMph: 9 },
                today: {
                  highF: 72,
                  lowF: 55,
                  sunrise: '2026-05-15T05:42',
                  sunset: '2026-05-15T20:09',
                  uvMax: 7,
                  precipMaxPct: 10,
                },
                forecast: [
                  { date: '2026-05-16', code: 3, highF: 75, lowF: 58 },
                  { date: '2026-05-17', code: 61, highF: 65, lowF: 50 },
                  { date: '2026-05-18', code: 0, highF: 70, lowF: 53 },
                ],
              }}
            />
          )}

          {headlinesCfg.type === 'headlines' && (
            <HeadlinesWidget
              widget={headlinesCfg}
              data={[
                { title: 'Synthetic headline one', link: 'https://example.com/1', source: 'NYT' },
                { title: 'Synthetic headline two', link: 'https://example.com/2', source: 'BBC' },
                { title: 'Synthetic headline three', link: 'https://example.com/3', source: 'NPR' },
              ]}
            />
          )}

          {launcherCfg.type === 'launcher' && <LauncherWidget widget={launcherCfg} />}
        </div>
      </div>
    </>
  );
}
