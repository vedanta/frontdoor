/**
 * Per-user dashboard — the real composition.
 *
 *   1. Cookie is already verified + slug-matched by the proxy (src/proxy.ts);
 *      we just read `userId` from the session for the config lookup.
 *   2. Load the user's `config:{userId}` from KV.
 *   3. Render the 6 sections in order; for each widget, render its component
 *      with awaited data (renderWidget dispatches to the right fetcher).
 *      All widget data is fetched in parallel via Promise.all — the slowest
 *      widget gates the page, not the sum of fetches.
 *   4. Compute the StatusBar colophon (#67) from already-fetched data:
 *      - version: build-time package.json
 *      - day/week/moon: pure date math
 *      - sunset: looked up from the first weather widget's cached data
 *        (the fetch is KV-cached, so this is a second cache read, not a
 *        second upstream call)
 *      - aggregate-stale count: walks the fetchedAt values bubbled up by
 *        renderWidget; rendered only when ≥ 2 widgets fall back to a
 *        previous-day cache (the single-widget case is covered by the
 *        per-widget StaleCaption #81)
 *   5. ISR: page is cached and revalidated daily (#25 triggers on-demand
 *      revalidation via the cron at 03:00 UTC, after /api/refresh warms KV).
 */
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { Fragment } from 'react';
import { configKey, getRedis, userKey, type UserRecord } from '@/lib/kv';
import { getSessionFromCookie } from '@/lib/auth';
import { DashboardConfigSchema, type DashboardConfig } from '@/lib/config';
import { Clock } from '@/components/Clock';
import { StatusBar } from '@/components/StatusBar';
import { SearchBar, buildShortcuts } from '@/components/search';
import { SectionDivider } from '@/components/widgets';
import {
  countStaleWidgets,
  dayOfYear,
  extractHhmm,
  getVersion,
  moonPhase,
  weekOfYear,
} from '@/lib/colophon';
import { fetchWeather } from '@/lib/data/sources/weather';
import { readEdgeGeo, resolveLocation } from '@/lib/location';
import { renderWidget } from './render-widget';

// ISR — 24h fallback. /api/revalidate (cron + on-edit) overrides this.
export const revalidate = 86400;

type Props = { params: Promise<{ slug: string }> };

export default async function DashboardPage({ params }: Props) {
  const { slug } = await params;
  const session = await getSessionFromCookie();

  // Middleware already guarantees an authenticated cookie matching the slug,
  // but defensive: if the session somehow isn't here, render not-found.
  if (!session) return notFound();

  const raw = await getRedis().get<DashboardConfig>(configKey(session.userId));
  if (!raw) return notFound();

  // Validate on read too — a config in KV that fails the schema means
  // something went very wrong (data corruption); fail loud.
  const parsed = DashboardConfigSchema.safeParse(raw);
  if (!parsed.success) return notFound();
  const config = parsed.data;

  const shortcuts = buildShortcuts(config);

  // ── Render context (#105 — layered location resolution) ────────────
  // Load the user record (for any saved lat/lon/city) + read Vercel edge
  // geo headers. Either may be absent; resolveLocation handles all paths.
  const userRecord = await getRedis().get<UserRecord>(userKey(session.userId));
  const edgeGeo = readEdgeGeo(await headers());
  const renderCtx = {
    userLocation: userRecord
      ? { lat: userRecord.lat, lon: userRecord.lon, city: userRecord.city }
      : undefined,
    edgeGeo,
  };

  // Fan out: every widget's data fetch in parallel.
  const renderedSections = await Promise.all(
    config.sections.map(async (section) => ({
      section,
      widgets: await Promise.all(section.widgets.map((w) => renderWidget(w, renderCtx))),
    })),
  );

  // ── StatusBar inputs (#67) ──────────────────────────────────────────
  const today = new Date();
  const todayUtc = today.toISOString().slice(0, 10);

  // Walk every rendered widget's `fetchedAt` and count those served from a
  // pre-today cache. Static widgets (links, launcher, image-static) carry
  // `null` and are skipped by `countStaleWidgets`.
  const fetchedAts = renderedSections.flatMap((s) => s.widgets.map((w) => w.fetchedAt));
  const staleCount = countStaleWidgets(fetchedAts, todayUtc);

  // Sunrise + sunset: pull from the first weather widget the user has
  // configured. The widget render already invoked `fetchWeather` (KV-cached);
  // this second call hits the same cache envelope — one extra KV read, no
  // upstream HTTP. Both omitted from the statusbar when no weather widget
  // is configured. Showing both gives a complete day-arc and supports the
  // departure-zone's "subtle next-day planning" function — see memory:
  // `departure-zone-status-bar`.
  let sunriseTime: string | null = null;
  let sunsetTime: string | null = null;
  const firstWeather = config.sections.flatMap((s) => s.widgets).find((w) => w.type === 'weather');
  if (firstWeather && firstWeather.type === 'weather') {
    // Resolve via the same layered logic the widget itself uses (#105).
    const loc = resolveLocation({
      widget: { lat: firstWeather.lat, lon: firstWeather.lon, city: firstWeather.city },
      user: renderCtx.userLocation,
      edge: renderCtx.edgeGeo,
    });
    const r = await fetchWeather(loc.lat, loc.lon);
    if (r.ok) {
      sunriseTime = extractHhmm(r.data.today.sunrise);
      sunsetTime = extractHhmm(r.data.today.sunset);
    }
  }

  return (
    <>
      <div className="grid-dots" />
      <div className="shell">
        <header className="header">
          <div className="header-left">
            <span className="logo">
              {config.title || 'frontdoor'}
              <span className="logo-dot" />
            </span>
            <span className="tagline">/fd/{slug}</span>
          </div>
          <div>
            <Clock />
          </div>
        </header>

        <SearchBar shortcuts={shortcuts} />

        <div className="grid">
          {renderedSections.map(({ section, widgets }) => (
            <Fragment key={section.id}>
              <SectionDivider id={section.id} title={section.title} subtitle={section.subtitle} />
              {widgets.map((w, i) => (
                <Fragment key={`${section.id}-${i}`}>{w.element}</Fragment>
              ))}
            </Fragment>
          ))}
        </div>

        <StatusBar
          version={getVersion()}
          moonPhase={moonPhase(today)}
          sunriseTime={sunriseTime}
          sunsetTime={sunsetTime}
          dayOfYear={dayOfYear(today)}
          weekOfYear={weekOfYear(today)}
          staleCount={staleCount}
        />
      </div>
    </>
  );
}
