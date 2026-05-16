import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WeatherWidget } from './Weather';
import type { WeatherWidget as WeatherConfig } from '@/lib/config';

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
});
