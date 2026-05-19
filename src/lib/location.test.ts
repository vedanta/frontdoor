import { describe, expect, it } from 'vitest';
import { FALLBACK_LOCATION, readEdgeGeo, resolveLocation } from './location';

describe('readEdgeGeo', () => {
  it('returns empty object when no x-vercel-ip-* headers present', () => {
    expect(readEdgeGeo(new Headers())).toEqual({});
  });

  it('reads lat / lon / city / region from Vercel headers', () => {
    const headers = new Headers({
      'x-vercel-ip-latitude': '40.0150',
      'x-vercel-ip-longitude': '-105.2705',
      'x-vercel-ip-city': 'Boulder',
      'x-vercel-ip-country-region': 'CO',
    });
    expect(readEdgeGeo(headers)).toEqual({
      lat: 40.015,
      lon: -105.2705,
      city: 'Boulder',
      region: 'CO',
    });
  });

  it('URL-decodes city (Vercel encodes "New%20York" etc.)', () => {
    const headers = new Headers({
      'x-vercel-ip-city': 'New%20York',
      'x-vercel-ip-country-region': 'NY',
    });
    expect(readEdgeGeo(headers).city).toBe('New York');
  });

  it('skips lat/lon when parse fails (non-numeric header value)', () => {
    const headers = new Headers({
      'x-vercel-ip-latitude': 'not-a-number',
      'x-vercel-ip-longitude': '',
    });
    const r = readEdgeGeo(headers);
    expect(r.lat).toBeUndefined();
    expect(r.lon).toBeUndefined();
  });
});

describe('resolveLocation', () => {
  it('falls back to FALLBACK_LOCATION when no source has coords', () => {
    const r = resolveLocation({});
    expect(r).toEqual({
      lat: FALLBACK_LOCATION.lat,
      lon: FALLBACK_LOCATION.lon,
      city: FALLBACK_LOCATION.city,
      source: 'fallback',
    });
  });

  it('picks edge geo when only edge has coords', () => {
    const r = resolveLocation({
      edge: { lat: 40.01, lon: -105.27, city: 'Boulder', region: 'CO' },
    });
    expect(r).toEqual({
      lat: 40.01,
      lon: -105.27,
      city: 'Boulder, CO',
      source: 'edge-geo',
    });
  });

  it('picks user-saved over edge geo', () => {
    const r = resolveLocation({
      user: { lat: 35.68, lon: 139.69, city: 'Tokyo' },
      edge: { lat: 40.01, lon: -105.27, city: 'Boulder', region: 'CO' },
    });
    expect(r.source).toBe('user-saved');
    expect(r.lat).toBe(35.68);
    expect(r.city).toBe('Tokyo');
  });

  it('picks widget override over both user and edge', () => {
    const r = resolveLocation({
      widget: { lat: 51.5, lon: -0.13, city: 'London' },
      user: { lat: 35.68, lon: 139.69, city: 'Tokyo' },
      edge: { lat: 40.01, lon: -105.27, city: 'Boulder', region: 'CO' },
    });
    expect(r.source).toBe('widget-override');
    expect(r.city).toBe('London');
  });

  it('ignores partial coords (lat without lon, or vice versa)', () => {
    // widget has lat but no lon → skip; user has both → win
    const r = resolveLocation({
      widget: { lat: 99.99 } as unknown as { lat: number },
      user: { lat: 35.68, lon: 139.69 },
    });
    expect(r.source).toBe('user-saved');
    expect(r.lat).toBe(35.68);
  });

  it('city composes city+region for edge geo', () => {
    const r = resolveLocation({
      edge: { lat: 1, lon: 1, city: 'Paris', region: 'IDF' },
    });
    expect(r.city).toBe('Paris, IDF');
  });

  it('city is just city when region absent', () => {
    const r = resolveLocation({
      edge: { lat: 1, lon: 1, city: 'Singapore' },
    });
    expect(r.city).toBe('Singapore');
  });

  it('city is null when no city anywhere', () => {
    const r = resolveLocation({
      edge: { lat: 1, lon: 1 },
    });
    expect(r.city).toBeNull();
  });
});
