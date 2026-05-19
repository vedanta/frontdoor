import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WeatherWidget } from './Weather';
import type { WeatherWidget as WeatherConfig } from '@/lib/config';
import type { ResolvedLocation } from '@/lib/location';

// UseMyLocation is a 'use client' that needs next/navigation's useRouter.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
}));

const widget: WeatherConfig = {
  type: 'weather',
  title: 'Weather',
  color: 'blue',
  icon: '◈',
  span: 1,
  lat: 40.71,
  lon: -74.01,
};

const data = {
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
};

describe('WeatherWidget', () => {
  it('renders current temp, description, details, 3-day strip', () => {
    render(<WeatherWidget widget={widget} data={data} />);
    expect(screen.getByText('68°')).toBeInTheDocument();
    expect(screen.getByText(/Partly cloudy/)).toBeInTheDocument();
    expect(screen.getByText(/feels 70°/)).toBeInTheDocument();
    expect(screen.getByText(/H 72° \/ L 55°/)).toBeInTheDocument();
    expect(screen.getByText('UV 7')).toBeInTheDocument();
    expect(screen.getByText(/55% hum/)).toBeInTheDocument();
  });

  it('renders sunrise/sunset times in HH:MM form', () => {
    render(<WeatherWidget widget={widget} data={data} />);
    expect(screen.getByText(/05:42/)).toBeInTheDocument();
    expect(screen.getByText(/20:09/)).toBeInTheDocument();
  });

  it('renders "could not load" on null data', () => {
    render(<WeatherWidget widget={widget} data={null} />);
    expect(screen.getByText('could not load')).toBeInTheDocument();
  });

  it('does NOT render stale caption when fetchedAt is today (#81c)', () => {
    const today = new Date().toISOString().slice(0, 10);
    const { container } = render(<WeatherWidget widget={widget} data={data} fetchedAt={today} />);
    expect(container.querySelector('.stale-caption')).not.toBeInTheDocument();
  });

  it('renders stale caption when fetchedAt is older than today (#81c)', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { container } = render(
      <WeatherWidget widget={widget} data={data} fetchedAt={yesterday} />,
    );
    expect(container.querySelector('.stale-caption')?.textContent).toBe('─ yesterday');
  });

  // ── #105: layered location row + UseMyLocation upgrade conditional ────

  const mkLocation = (
    source: ResolvedLocation['source'],
    city: string | null,
  ): ResolvedLocation => ({
    lat: 40.01,
    lon: -105.27,
    city,
    source,
  });

  it('renders city alone for edge-geo source (IP precision; coords would mislead)', () => {
    const { container } = render(
      <WeatherWidget
        widget={widget}
        data={data}
        location={mkLocation('edge-geo', 'Boulder, CO')}
      />,
    );
    expect(container.querySelector('.weather-location-label')?.textContent).toBe('Boulder, CO');
  });

  it('renders city · coords for user-saved source (GPS-precise; #110)', () => {
    const { container } = render(
      <WeatherWidget
        widget={widget}
        data={data}
        location={mkLocation('user-saved', 'Tokyo, Tokyo')}
      />,
    );
    expect(container.querySelector('.weather-location-label')?.textContent).toBe(
      'Tokyo, Tokyo · 40.01°, -105.27°',
    );
  });

  it('renders coords-only when location has no city (#110)', () => {
    const { container } = render(
      <WeatherWidget widget={widget} data={data} location={mkLocation('edge-geo', null)} />,
    );
    expect(container.querySelector('.weather-location-label')?.textContent).toBe(
      '40.01°, -105.27°',
    );
  });

  it('renders coords-only for user-saved when reverse-geocode failed (#110)', () => {
    const { container } = render(
      <WeatherWidget widget={widget} data={data} location={mkLocation('user-saved', null)} />,
    );
    expect(container.querySelector('.weather-location-label')?.textContent).toBe(
      '40.01°, -105.27°',
    );
  });

  it('shows "use precise location" link when source is edge-geo or fallback', () => {
    for (const source of ['edge-geo', 'fallback'] as const) {
      const { container } = render(
        <WeatherWidget widget={widget} data={data} location={mkLocation(source, 'Boulder')} />,
      );
      expect(container.querySelector('.loc-upgrade')).toBeInTheDocument();
    }
  });

  it('hides "use precise location" link when source is user-saved or widget-override', () => {
    for (const source of ['user-saved', 'widget-override'] as const) {
      const { container } = render(
        <WeatherWidget widget={widget} data={data} location={mkLocation(source, 'Boulder')} />,
      );
      expect(container.querySelector('.loc-upgrade')).not.toBeInTheDocument();
    }
  });

  it('does NOT render the location row when no location prop passed', () => {
    const { container } = render(<WeatherWidget widget={widget} data={data} />);
    expect(container.querySelector('.weather-location')).not.toBeInTheDocument();
  });
});
