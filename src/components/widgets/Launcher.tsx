/**
 * App-launcher widget — favicon grid. Config-only.
 * Per design/03-widget-specs.md → `launcher`.
 *   - 36px favicon tiles, no text labels
 *   - Name + key shown as a hover tooltip
 *   - Favicon URL from icon.horse(host(url)), per-app `icon` override wins
 *   - Letter-tile fallback handled in CSS + onerror (client-only); for the
 *     SSR-only render here, we always show the <img>. A subsequent
 *     client-component upgrade can add the onError swap.
 */
import type { LauncherWidget } from '@/lib/config';
import { faviconUrl, letterTile } from '@/lib/data/sources/favicon';
import { Panel } from './Panel';

type Props = { widget: LauncherWidget };

export function LauncherWidget({ widget }: Props) {
  return (
    <Panel color={widget.color} span={widget.span} icon={widget.icon} title={widget.title}>
      <div
        className="launcher-grid"
        style={{ gridTemplateColumns: `repeat(${widget.columns}, 1fr)` }}
      >
        {widget.apps.map((app) => {
          const src = faviconUrl(app.url, app.icon);
          const tooltipLabel = app.key ? `${app.name} [${app.key}]` : app.name;
          return (
            <a
              key={app.url}
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              className="launcher-tile"
              title={tooltipLabel}
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element -- favicons come from icon.horse (or per-app overrides on arbitrary domains); next/image's remote-patterns would need a wildcard which defeats its purpose. 36px tiles, lazy-loaded — the optimization next/image provides isn't material here.
                <img
                  className="launcher-favicon"
                  src={src}
                  alt={app.name}
                  loading="lazy"
                  width={36}
                  height={36}
                />
              ) : (
                <div className="launcher-favicon launcher-favicon--fallback">
                  {letterTile(app.name)}
                </div>
              )}
              <span className="launcher-tooltip">{tooltipLabel}</span>
            </a>
          );
        })}
      </div>
    </Panel>
  );
}
