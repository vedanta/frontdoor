import { afterEach, describe, expect, it, vi } from 'vitest';
import { composeCityLabel, reverseGeocode } from './reverse-geocode';

const ORIGINAL_FETCH = globalThis.fetch;

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): void {
  const { ok = true, status = 200 } = init;
  globalThis.fetch = vi.fn(async () => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  void ok; // status drives ok; explicit ok here is just for caller readability
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe('reverseGeocode', () => {
  it('returns city + region from BigDataCloud response', async () => {
    mockFetchOnce({
      city: 'Boulder',
      principalSubdivision: 'Colorado',
      countryCode: 'US',
    });
    const r = await reverseGeocode(40.015, -105.2705);
    expect(r).toEqual({ city: 'Boulder', region: 'Colorado' });
  });

  it('falls back to locality when city missing', async () => {
    mockFetchOnce({
      city: '',
      locality: 'Shinjuku',
      principalSubdivision: 'Tokyo',
    });
    const r = await reverseGeocode(35.68, 139.69);
    expect(r).toEqual({ city: 'Shinjuku', region: 'Tokyo' });
  });

  it('omits region when principalSubdivision absent', async () => {
    mockFetchOnce({ city: 'Singapore' });
    const r = await reverseGeocode(1.35, 103.82);
    expect(r).toEqual({ city: 'Singapore' });
    expect(r).not.toHaveProperty('region');
  });

  it('returns null when both city and locality empty (e.g., ocean)', async () => {
    mockFetchOnce({ city: '', locality: '', principalSubdivision: '' });
    const r = await reverseGeocode(0, 0);
    expect(r).toBeNull();
  });

  it('returns null on HTTP error', async () => {
    mockFetchOnce({ error: 'rate-limited' }, { status: 429 });
    const r = await reverseGeocode(40, -105);
    expect(r).toBeNull();
  });

  it('returns null on network failure (fetch throws)', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    const r = await reverseGeocode(40, -105);
    expect(r).toBeNull();
  });

  it('returns null for non-finite coords (defense-in-depth)', async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    expect(await reverseGeocode(NaN, 0)).toBeNull();
    expect(await reverseGeocode(0, Infinity)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('rounds coords to 4 decimals before requesting', async () => {
    let capturedUrl = '';
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      capturedUrl = input.toString();
      return new Response(JSON.stringify({ city: 'X' }), { status: 200 });
    }) as unknown as typeof fetch;

    await reverseGeocode(40.015123456789, -105.27054321);
    expect(capturedUrl).toContain('latitude=40.0151');
    expect(capturedUrl).toContain('longitude=-105.2705');
  });
});

describe('composeCityLabel', () => {
  it('joins city + region with comma', () => {
    expect(composeCityLabel({ city: 'Boulder', region: 'CO' })).toBe('Boulder, CO');
  });

  it('returns just city when region absent', () => {
    expect(composeCityLabel({ city: 'Singapore' })).toBe('Singapore');
  });
});
