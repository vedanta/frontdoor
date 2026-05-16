/**
 * Weather — Open-Meteo current conditions + 3-day forecast.
 *
 *   GET https://api.open-meteo.com/v1/forecast
 *     ?latitude={lat}&longitude={lon}
 *     &current=temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m
 *     &daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,
 *            uv_index_max,precipitation_probability_max
 *     &temperature_unit=fahrenheit&wind_speed_unit=mph
 *     &timezone=auto&forecast_days=4
 *
 * No API key. Per design/04-data-sources.md → Weather.
 * Cache key: `weather:{lat,lon}:{date}` (per-location, NOT per-user).
 */
import { fetchUpstream } from '../fetch';
import { withResilience } from '../resilience';
import { formatDate, weatherKey } from '@/lib/kv';
import type { FetchResult } from '../types';
import type { WeatherData } from './types';
import { yesterday } from './util';

/** WMO weather-code → human description. (Icon mapping is the widget's job.) */
export const WMO_DESCRIPTIONS: Record<number, string> = {
  0: 'Clear',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Dense drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  80: 'Showers',
  81: 'Heavy showers',
  82: 'Violent showers',
  95: 'Thunderstorm',
  96: 'Hail storm',
  99: 'Severe storm',
};

export function wmoDescription(code: number): string {
  return WMO_DESCRIPTIONS[code] ?? 'Unknown';
}

type OpenMeteoResponse = {
  current?: {
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
  };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    sunrise: string[];
    sunset: string[];
    uv_index_max: number[];
    precipitation_probability_max: number[];
  };
};

function buildUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'auto',
    forecast_days: '4',
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

export async function fetchWeather(lat: number, lon: number): Promise<FetchResult<WeatherData>> {
  const today = formatDate();

  return withResilience<WeatherData>(weatherKey(lat, lon, today), {
    staleFallbackKey: weatherKey(lat, lon, yesterday()),
    fetcher: async (): Promise<FetchResult<WeatherData>> => {
      const res = await fetchUpstream<OpenMeteoResponse>(buildUrl(lat, lon));
      if (!res.ok) return { ok: false, reason: res.reason };

      const { current, daily } = res.data;
      if (!current || !daily) return { ok: false, reason: 'open-meteo-shape' };

      const data: WeatherData = {
        current: {
          tempF: Math.round(current.temperature_2m),
          feelsLikeF: Math.round(current.apparent_temperature),
          code: current.weather_code,
          humidity: current.relative_humidity_2m,
          windMph: Math.round(current.wind_speed_10m),
        },
        today: {
          highF: Math.round(daily.temperature_2m_max[0]),
          lowF: Math.round(daily.temperature_2m_min[0]),
          sunrise: daily.sunrise[0] ?? '',
          sunset: daily.sunset[0] ?? '',
          uvMax: daily.uv_index_max[0] ?? 0,
          precipMaxPct: daily.precipitation_probability_max[0] ?? 0,
        },
        forecast: [1, 2, 3].map((i) => ({
          date: daily.time[i] ?? '',
          code: daily.weather_code[i] ?? 0,
          highF: Math.round(daily.temperature_2m_max[i] ?? 0),
          lowF: Math.round(daily.temperature_2m_min[i] ?? 0),
        })),
      };

      return { ok: true, fresh: true, data };
    },
  });
}
