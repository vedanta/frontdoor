/**
 * Layered location resolution (#105).
 *
 * Priority (highest first):
 *   1. Per-widget config (rare multi-location override)
 *   2. UserRecord (`user.lat/lon/city`) — saved via `<UseMyLocation/>` grant
 *      or `/api/user` PUT
 *   3. Vercel edge geo (`x-vercel-ip-latitude` / `x-vercel-ip-longitude` /
 *      `x-vercel-ip-city` headers, set automatically on prod)
 *   4. Hardcoded NYC fallback (40.71, -74.01) — last resort
 *
 * Pure function: takes the three potential sources, picks the highest-priority
 * present one. Caller is responsible for reading edge headers (page.tsx via
 * `next/headers`) and the user record (already loaded for cookie auth).
 *
 * Per CLAUDE.md gotcha: NEVER IP-geolocate from a serverless function
 * (returns Vercel's datacenter). Use edge headers via Next; those are set
 * by the platform at the edge layer before the request reaches our code.
 */

/** Layered-resolved location. `source` lets the UI explain "where this came from". */
export type ResolvedLocation = {
  lat: number;
  lon: number;
  /** Human-readable label when available (e.g. `'Boulder, CO'`). */
  city: string | null;
  /** Which layer this resolved from — for display + debugging. */
  source: 'widget-override' | 'user-saved' | 'edge-geo' | 'fallback';
};

/** Hardcoded last-resort location. Matches the historical DEFAULT_CONFIG default. */
export const FALLBACK_LOCATION = {
  lat: 40.71,
  lon: -74.01,
  city: 'New York, NY',
} as const;

/** Edge geo data, parsed from Vercel headers. All fields optional. */
export type EdgeGeo = {
  lat?: number;
  lon?: number;
  city?: string;
  region?: string;
};

/** User-saved location (subset of UserRecord). */
export type UserLocation = {
  lat?: number;
  lon?: number;
  city?: string;
};

/** Per-widget location override (subset of WeatherWidget config). */
export type WidgetLocation = {
  lat?: number;
  lon?: number;
  city?: string;
};

/**
 * Read Vercel edge geo from headers. Returns `{}` when headers absent (local
 * dev, non-Edge runtime, etc.). Headers are URL-encoded by Vercel; we decode.
 */
export function readEdgeGeo(headers: Headers): EdgeGeo {
  const decode = (v: string | null): string | undefined => {
    if (!v) return undefined;
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  const latStr = headers.get('x-vercel-ip-latitude');
  const lonStr = headers.get('x-vercel-ip-longitude');
  const city = decode(headers.get('x-vercel-ip-city'));
  const region = decode(headers.get('x-vercel-ip-country-region'));
  const lat = latStr ? Number(latStr) : undefined;
  const lon = lonStr ? Number(lonStr) : undefined;
  return {
    ...(Number.isFinite(lat) ? { lat: lat as number } : {}),
    ...(Number.isFinite(lon) ? { lon: lon as number } : {}),
    ...(city ? { city } : {}),
    ...(region ? { region } : {}),
  };
}

/**
 * Compose a city label from edge-geo city+region (e.g. `'Boulder, CO'`).
 * Returns just `city` if region absent, `null` if both absent.
 */
function composeCity(city?: string, region?: string): string | null {
  if (!city) return null;
  if (!region) return city;
  return `${city}, ${region}`;
}

/**
 * Resolve a location from layered sources. Picks the highest-priority source
 * that has BOTH lat and lon set; `city` is filled from the same source when
 * available, else falls back to the edge-geo city as a label-only hint.
 */
export function resolveLocation(input: {
  widget?: WidgetLocation;
  user?: UserLocation;
  edge?: EdgeGeo;
}): ResolvedLocation {
  const { widget, user, edge } = input;

  // 1. per-widget override
  if (widget?.lat !== undefined && widget?.lon !== undefined) {
    return {
      lat: widget.lat,
      lon: widget.lon,
      city: widget.city ?? null,
      source: 'widget-override',
    };
  }

  // 2. user-saved
  if (user?.lat !== undefined && user?.lon !== undefined) {
    return {
      lat: user.lat,
      lon: user.lon,
      city: user.city ?? null,
      source: 'user-saved',
    };
  }

  // 3. Vercel edge geo
  if (edge?.lat !== undefined && edge?.lon !== undefined) {
    return {
      lat: edge.lat,
      lon: edge.lon,
      city: composeCity(edge.city, edge.region),
      source: 'edge-geo',
    };
  }

  // 4. hardcoded fallback
  return {
    lat: FALLBACK_LOCATION.lat,
    lon: FALLBACK_LOCATION.lon,
    city: FALLBACK_LOCATION.city,
    source: 'fallback',
  };
}
