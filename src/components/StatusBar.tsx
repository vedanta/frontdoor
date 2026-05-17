/**
 * StatusBar — the dashboard's colophon strip (#67 redesign).
 *
 * Server component as of v0.1.0. Every label is computable at page-render
 * time; the only interactive bit (font A−/A+) is delegated to the
 * `<FontControls/>` client child.
 *
 * Items (left → right):
 *   v0.1.0   🌒 ↑ 05:42 ↓ 20:14   day 137 · week 20   [N widgets stale]   A− 13px A+
 *      ↑              ↑                  ↑                    ↑
 *   linked     moon emoji +       ISO 8601 week           only when N ≥ 2
 *   release    sunrise + sunset   + day-of-year            (per-widget #81 caption
 *   notes      (both omit if no                             covers the single case)
 *              weather widget
 *              configured)
 *
 * The arrival-zone trust contract (`design/02` per #76) doesn't apply here:
 * this lives at the absolute bottom of `.shell`, in natural document flow,
 * so it's only encountered during departure. See memory:
 * `departure-zone-status-bar` for the principle refinement that justifies
 * the colophon-style content here vs. the rejected always-on per-widget
 * pattern in #66.
 */
import type { VersionLabel, MoonPhase } from '@/lib/colophon';
import { FontControls } from './FontControls';

// Threshold for showing the aggregate-stale chunk. `1` is already covered
// by the per-widget StaleCaption (#81); aggregate adds value only when a
// pattern is forming — i.e. ≥ 2 widgets simultaneously falling back.
const STALE_THRESHOLD = 2;

export type StatusBarProps = {
  version: VersionLabel;
  moonPhase: MoonPhase;
  /** HH:MM, e.g. `'05:42'`. Null when no weather widget is configured. */
  sunriseTime: string | null;
  /** HH:MM, e.g. `'20:14'`. Null when no weather widget is configured. */
  sunsetTime: string | null;
  dayOfYear: number;
  weekOfYear: number;
  /** Count of widgets whose data was served from a previous-day cache. */
  staleCount: number;
};

export function StatusBar({
  version,
  moonPhase,
  sunriseTime,
  sunsetTime,
  dayOfYear,
  weekOfYear,
  staleCount,
}: StatusBarProps) {
  return (
    <div className="statusbar">
      <div className="status-item">
        {version.href ? (
          <a
            href={version.href}
            target="_blank"
            rel="noopener noreferrer"
            className="status-link"
            title={`release notes for ${version.label}`}
          >
            {version.label}
          </a>
        ) : (
          <span>{version.label}</span>
        )}
      </div>

      <div className="status-item" title={moonPhase.name}>
        <span className="status-moon" aria-label={moonPhase.name}>
          {moonPhase.emoji}
        </span>
        {sunriseTime !== null && <span>↑ {sunriseTime}</span>}
        {sunsetTime !== null && <span>↓ {sunsetTime}</span>}
      </div>

      <div className="status-item">
        <span>
          day {dayOfYear} · week {weekOfYear}
        </span>
      </div>

      {staleCount >= STALE_THRESHOLD && (
        <div className="status-item status-item--stale">
          <span>{staleCount} widgets stale</span>
        </div>
      )}

      <FontControls />
    </div>
  );
}
