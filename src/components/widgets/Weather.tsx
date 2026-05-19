/**
 * Weather widget — renders the data returned by fetchWeather (#9).
 * Per design/03-widget-specs.md → `weather`.
 *
 * Layout:
 *   - Big current temp + WMO icon + description
 *   - Detail row: H/L · humidity · wind · UV · rain
 *   - 3-day compact strip
 *   - Sunrise / sunset
 */
import type { WeatherWidget as WeatherWidgetConfig } from '@/lib/config';
import type { WeatherData } from '@/lib/data/sources/types';
import { wmoDescription } from '@/lib/data/sources/weather';
import type { ResolvedLocation } from '@/lib/location';
import { Panel } from './Panel';
import { CouldNotLoad } from './CouldNotLoad';
import { StaleCaption } from './StaleCaption';
import { UseMyLocation } from './UseMyLocation';

type Props = {
  widget: WeatherWidgetConfig;
  data: WeatherData | null;
  /**
   * When this location's weather was last successfully fetched. Threaded
   * from `withResilience` via the dispatcher; surfaces "yesterday" / etc.
   * when content was served from a previous-day cache. Per #81b/#81c.
   */
  fetchedAt?: string | null;
  /**
   * The location this widget rendered for, resolved via the #105 layered
   * pipeline (widget-override > user-saved > edge-geo > fallback). Shown
   * inline; `source` drives whether the `<UseMyLocation/>` upgrade link
   * appears (only when current source is `edge-geo` or `fallback`).
   */
  location?: ResolvedLocation;
};

/** WMO code → single-glyph icon. Mirrors design/04-data-sources.md. */
const WMO_ICONS: Record<number, string> = {
  0: '☀',
  1: '☼',
  2: '⛅',
  3: '☁',
  45: '🌫',
  48: '🌫',
  51: '🌦',
  53: '🌦',
  55: '🌦',
  61: '🌧',
  63: '🌧',
  65: '🌧',
  71: '🌨',
  73: '🌨',
  75: '🌨',
  80: '🌧',
  81: '🌧',
  82: '🌧',
  95: '⛈',
  96: '⛈',
  99: '⛈',
};
const wmoIcon = (code: number) => WMO_ICONS[code] ?? '·';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const shortDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : DAYS[d.getUTCDay()];
};

/** Pull HH:MM from an ISO-ish datetime string. */
const timeOnly = (iso: string) => iso.split('T')[1] ?? iso;

/** Format the resolved location for the small footer label. */
function formatLocationLabel(loc: ResolvedLocation): string {
  if (loc.city) return loc.city;
  // No city — show coords (rounded to 2 decimals; same resolution as the cache key).
  const round = (n: number) => Math.round(n * 100) / 100;
  return `${round(loc.lat)}°, ${round(loc.lon)}°`;
}

export function WeatherWidget({ widget, data, fetchedAt, location }: Props) {
  return (
    <Panel color={widget.color} span={widget.span} icon={widget.icon} title={widget.title}>
      {!data ? (
        <CouldNotLoad />
      ) : (
        <>
          <div className="weather-now">
            <div className="weather-icon">{wmoIcon(data.current.code)}</div>
            <div>
              <div className="weather-temp">{data.current.tempF}°</div>
              <div className="weather-desc">
                {wmoDescription(data.current.code)} · feels {data.current.feelsLikeF}°
              </div>
            </div>
          </div>
          <div className="weather-details">
            <span>
              H {data.today.highF}° / L {data.today.lowF}°
            </span>
            <span>{data.current.humidity}% hum</span>
            <span>{data.current.windMph} mph</span>
            <span>UV {data.today.uvMax}</span>
            <span>{data.today.precipMaxPct}% rain</span>
          </div>
          <div className="weather-forecast-compact">
            {data.forecast.map((d) => (
              <div className="weather-fc-day" key={d.date}>
                <div className="fc-label">{shortDay(d.date)}</div>
                <div className="fc-icon">{wmoIcon(d.code)}</div>
                <div className="fc-temps">
                  {d.highF}° <span>{d.lowF}°</span>
                </div>
              </div>
            ))}
          </div>
          <div className="weather-sun">
            <span>↑ {timeOnly(data.today.sunrise)}</span>
            <span>↓ {timeOnly(data.today.sunset)}</span>
          </div>
          {location && (
            <div className="weather-location">
              <span className="weather-location-label">{formatLocationLabel(location)}</span>
              {/* Surface the precision-upgrade link only when we're NOT
                  already on the user's saved location (i.e., source is
                  edge-geo or the hardcoded fallback). After a successful
                  grant, the source becomes 'user-saved' and this hides. */}
              {(location.source === 'edge-geo' || location.source === 'fallback') && (
                <UseMyLocation />
              )}
            </div>
          )}
          <StaleCaption fetchedAt={fetchedAt} />
        </>
      )}
    </Panel>
  );
}
