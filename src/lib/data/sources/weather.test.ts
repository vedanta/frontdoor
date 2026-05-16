import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../mocks/server';

const kvStore = new Map<string, unknown>();
const fakeRedis = {
  get: async <T>(k: string): Promise<T | null> => (kvStore.get(k) as T | undefined) ?? null,
  set: async (k: string, v: unknown): Promise<'OK'> => {
    kvStore.set(k, v);
    return 'OK';
  },
};

vi.mock('@/lib/kv', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getRedis: () => fakeRedis };
});

import { fetchWeather, wmoDescription } from './weather';

const METEO = 'https://api.open-meteo.com/v1/forecast';

beforeEach(() => {
  kvStore.clear();
  server.resetHandlers();
});

describe('wmoDescription', () => {
  it('maps the documented WMO codes', () => {
    expect(wmoDescription(0)).toBe('Clear');
    expect(wmoDescription(63)).toBe('Rain');
    expect(wmoDescription(95)).toBe('Thunderstorm');
  });

  it('returns "Unknown" for unmapped codes', () => {
    expect(wmoDescription(9999)).toBe('Unknown');
  });
});

describe('fetchWeather', () => {
  it('rounds current/high/low/wind to integers and exposes today + 3-day forecast', async () => {
    server.use(
      http.get(METEO, () =>
        HttpResponse.json({
          current: {
            temperature_2m: 68.4,
            apparent_temperature: 70.1,
            weather_code: 2,
            relative_humidity_2m: 55,
            wind_speed_10m: 8.7,
          },
          daily: {
            time: ['2026-05-15', '2026-05-16', '2026-05-17', '2026-05-18'],
            weather_code: [2, 3, 61, 0],
            temperature_2m_max: [72.3, 74.8, 65.1, 70.0],
            temperature_2m_min: [55.2, 57.9, 50.4, 53.1],
            sunrise: [
              '2026-05-15T05:42',
              '2026-05-16T05:41',
              '2026-05-17T05:40',
              '2026-05-18T05:39',
            ],
            sunset: [
              '2026-05-15T20:09',
              '2026-05-16T20:10',
              '2026-05-17T20:11',
              '2026-05-18T20:12',
            ],
            uv_index_max: [7, 8, 5, 6],
            precipitation_probability_max: [10, 30, 80, 0],
          },
        }),
      ),
    );

    const res = await fetchWeather(40.71, -74.01);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.current.tempF).toBe(68); // 68.4 → 68
      expect(res.data.current.feelsLikeF).toBe(70); // 70.1 → 70
      expect(res.data.current.windMph).toBe(9); // 8.7 → 9
      expect(res.data.today.highF).toBe(72);
      expect(res.data.today.lowF).toBe(55);
      expect(res.data.today.sunrise).toBe('2026-05-15T05:42');
      expect(res.data.forecast).toHaveLength(3);
      expect(res.data.forecast[0].date).toBe('2026-05-16'); // today excluded
      expect(res.data.forecast[0].code).toBe(3);
    }
  });

  it('missing daily/current → could-not-load', async () => {
    server.use(http.get(METEO, () => HttpResponse.json({})));
    const res = await fetchWeather(40.71, -74.01);
    expect(res.ok).toBe(false);
  });
});
