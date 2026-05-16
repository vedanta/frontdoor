/**
 * Root route — interim demo of all 7 widget types. Uses a mix of:
 *   - real data (stoic is offline/deterministic, links/launcher are pure config)
 *   - synthetic placeholders (headlines + weather + image — real fetches are slow
 *     on cold KV; #23 wires the page properly with awaited data)
 *
 * Real MVP entry is /d/[slug] (#23). The "enter your key" page also lives here
 * (#20). Both replace this when they land.
 */
import { DEFAULT_CONFIG } from '@/lib/config';
import { fetchStoic } from '@/lib/data/sources/stoic';
import {
  SectionDivider,
  LinksWidget,
  LauncherWidget,
  HeadlinesWidget,
  WeatherWidget,
  ImageWidget,
  TextWidget,
} from '@/components/widgets';

function firstWidgetOfType<T extends string>(type: T) {
  for (const section of DEFAULT_CONFIG.sections) {
    for (const w of section.widgets) {
      if (w.type === type) return w;
    }
  }
  return null;
}

export default function Home() {
  const stoicCfg = firstWidgetOfType('text')!; // Stoic — first text widget in Arrive
  const stoicData = fetchStoic();
  const linksCfg = firstWidgetOfType('links')!;
  const launcherCfg = firstWidgetOfType('launcher')!;
  const headlinesCfg = firstWidgetOfType('headlines')!;
  const weatherCfg = firstWidgetOfType('weather')!;
  const imageCfg = firstWidgetOfType('image')!;

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
              widgets demo · all 7 types · /d/[slug] is the real entry
            </span>
          </div>
        </header>

        <div className="grid">
          {/* section divider */}
          <SectionDivider
            id="arrive"
            title="Widgets Demo"
            subtitle="all 7 types with placeholder data"
          />

          {/* text */}
          {stoicCfg.type === 'text' && stoicData.ok && (
            <TextWidget widget={stoicCfg} data={stoicData.data} />
          )}

          {/* links */}
          {linksCfg.type === 'links' && <LinksWidget widget={linksCfg} />}

          {/* image (static demo to avoid a live fetch on placeholder render) */}
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
                  'Static placeholder. The real daily-image fetchers (#7) are wired; the page composer (#23) calls them.',
              }}
            />
          )}

          {/* weather — synthetic data */}
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

          {/* headlines — synthetic data */}
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

          {/* launcher — last so its full-width spans cleanly */}
          {launcherCfg.type === 'launcher' && <LauncherWidget widget={launcherCfg} />}
        </div>
      </div>
    </>
  );
}
