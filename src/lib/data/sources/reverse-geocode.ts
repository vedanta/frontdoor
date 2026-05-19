/**
 * Reverse geocoding (#110) — lat/lon → human city + region.
 *
 * Used by `/api/user` PUT when the browser-geolocation flow
 * (`<UseMyLocation/>`, #105) hands us raw coords without a label. We persist
 * `{ lat, lon, city }` on the UserRecord so the weather widget can render
 * "Tokyo · 35.68°, 139.69°" instead of bare coords.
 *
 * Provider: BigDataCloud's free reverse-geocode-client endpoint — no API key,
 * no per-request rate limit at our scale. Their schema:
 *   {
 *     city: "Tokyo",
 *     locality: "Shinjuku",                // sometimes more specific than city
 *     principalSubdivision: "Tokyo",       // region/state — empty for some countries
 *     principalSubdivisionCode: "JP-13",
 *     countryName: "Japan",
 *     countryCode: "JP",
 *     ...
 *   }
 *
 * We prefer `city` (locality fallback) and pair it with `principalSubdivision`
 * for US-style "Boulder, CO" labels.
 *
 * Not cached — this is a one-shot user-action call (`<UseMyLocation/>` click),
 * not daily-fetched content. The result lives on UserRecord, not in date-keyed
 * KV. Failure returns `null` and the caller still persists lat/lon so the
 * label degrades to coords-only rather than breaking the save flow.
 */
import { fetchUpstream } from '../fetch';

type BigDataCloudResponse = {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  countryCode?: string;
};

export type ReverseGeocodeResult = {
  /** Human-readable city ("Tokyo", "Boulder"). */
  city: string;
  /** Region/state ("CA", "CO", "Tokyo") — may be missing for some countries. */
  region?: string;
};

const ENDPOINT = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

/**
 * Round to 4 decimals before sending — ~11m of precision, well within the
 * granularity of any city-level lookup, and trims the URL so cache-friendly
 * intermediaries don't see infinite unique URLs.
 */
function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<ReverseGeocodeResult | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const url = `${ENDPOINT}?latitude=${round4(lat)}&longitude=${round4(lon)}&localityLanguage=en`;

  const res = await fetchUpstream<BigDataCloudResponse>(url, { timeoutMs: 2000 });
  if (!res.ok) return null;

  const body = res.data;
  // Prefer city; fall back to locality. Some sparse-coverage points return
  // neither (e.g., ocean, antarctica) — null out so the caller can persist
  // lat/lon-only without a junk label.
  const city = (body?.city || body?.locality || '').trim();
  if (!city) return null;

  const region = body?.principalSubdivision?.trim() || undefined;
  return region ? { city, region } : { city };
}

/**
 * Compose the BigDataCloud result into the `city` string we persist on
 * UserRecord. Pairs city + region into "Boulder, CO" form when both present.
 */
export function composeCityLabel(result: ReverseGeocodeResult): string {
  return result.region ? `${result.city}, ${result.region}` : result.city;
}
