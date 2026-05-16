/**
 * Per-user dashboard — the real composition.
 *
 *   1. Cookie is already verified + slug-matched by middleware (src/middleware.ts);
 *      we just read `userId` from the session for the config lookup.
 *   2. Load the user's `config:{userId}` from KV.
 *   3. Render the 6 sections in order; for each widget, render its component
 *      with awaited data (renderWidget dispatches to the right fetcher).
 *      All widget data is fetched in parallel via Promise.all — the slowest
 *      widget gates the page, not the sum of fetches.
 *   4. ISR: page is cached and revalidated daily (#25 triggers on-demand
 *      revalidation via the cron at 03:00 UTC, after /api/refresh warms KV).
 */
import { notFound } from 'next/navigation';
import { Fragment } from 'react';
import { configKey, getRedis } from '@/lib/kv';
import { getSessionFromCookie } from '@/lib/auth';
import { DashboardConfigSchema, type DashboardConfig } from '@/lib/config';
import { Clock } from '@/components/Clock';
import { StatusBar } from '@/components/StatusBar';
import { SearchBar, buildShortcuts } from '@/components/search';
import { SectionDivider } from '@/components/widgets';
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

  // Fan out: every widget's data fetch in parallel.
  const renderedSections = await Promise.all(
    config.sections.map(async (section) => ({
      section,
      widgets: await Promise.all(section.widgets.map((w) => renderWidget(w))),
    })),
  );

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
            <span className="tagline">/d/{slug}</span>
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
                <Fragment key={`${section.id}-${i}`}>{w}</Fragment>
              ))}
            </Fragment>
          ))}
        </div>

        <StatusBar />
      </div>
    </>
  );
}
