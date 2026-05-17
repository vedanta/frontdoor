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
import { Panel } from './Panel';
import { CouldNotLoad } from './CouldNotLoad';
import { StaleCaption } from './StaleCaption';

type Props = {
  widget: WeatherWidgetConfig;
  data: WeatherData | null;
  /**
   * When this location's weather was last successfully fetched. Threaded
   * from `withResilience` via the dispatcher; surfaces "yesterday" / etc.
   * when content was served from a previous-day cache. Per #81b/#81c.
   */
  fetchedAt?: string | null;
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

export function WeatherWidget({ widget, data, fetchedAt }: Props) {
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
          <StaleCaption fetchedAt={fetchedAt} />
        </>
      )}
    </Panel>
  );
}
