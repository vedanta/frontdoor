/**
 * Vercel KV (Upstash Redis) key spaces — every key the app reads or writes.
 *
 * See docs/architecture.md §6 → "KV key spaces" for the canonical table.
 * These helpers exist for two reasons:
 *   1) Centralize the string templates so a typo can't silently miss the cache.
 *   2) Give the rest of the codebase typed insertion points.
 *
 * Convention: dates are always `YYYY-MM-DD` in UTC (use `formatDate`).
 */

/** User account record, stored at `user:{userId}`. */
export type UserRecord = {
  email: string;
  apiKey: string;
  slug: string;
  /** Optional display name; populated when/if the user sets one (post-MVP). */
  name?: string;
  /**
   * Optional IANA timezone string (e.g. `'America/New_York'`). Populated when
   * the user sets one via PUT /api/user (#69). Foundation for future per-user
   * timezone-aware features (rolling caches at local midnight, scheduled
   * refresh, etc.); not yet consumed by any data fetcher.
   */
  timezone?: string;
  /** ISO 8601 UTC timestamp. */
  createdAt: string;
};

/** Format a Date as `YYYY-MM-DD` in UTC — the cache-key date convention. */
export function formatDate(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

// === User identity ===

/** `key:{apiKey}` → `userId`. Lookup by API key (Bearer header value). */
export const apiKeyKey = (apiKey: string): string => `key:${apiKey}`;

/** `email:{email}` → `userId`. Signup idempotency + key recovery. Email is lowercased. */
export const emailKey = (email: string): string => `email:${email.toLowerCase()}`;

/** `slug:{slug}` → `userId`. Resolves a `/fd/[slug]` route to its user. */
export const slugKey = (slug: string): string => `slug:${slug}`;

/** `user:{userId}` → `UserRecord` (JSON). */
export const userKey = (userId: string): string => `user:${userId}`;

/** Redis SET of all `userId`s. Lets cron enumerate users to revalidate ISR. */
export const USERS_SET = 'users';

/**
 * One-time bootstrap token (#73) → identity wrapper. Set with Redis `EX` so
 * the key auto-prunes; the embedded `exp` is a defensive second check at
 * read time. Single-use: the proxy `DEL`s the key after a successful
 * exchange so a second visit returns 410.
 */
export type BootstrapRecord = {
  userId: string;
  slug: string;
  /** Unix milliseconds. Defensive — Redis `EX` is the primary expiry. */
  exp: number;
};

/** `bootstrap:{token}` → `BootstrapRecord` (JSON). TTL-d via `EX`. */
export const bootstrapKey = (token: string): string => `bootstrap:${token}`;

// === Per-user config ===

/** `config:{userId}` → dashboard config JSON (shape in design/05-config-schema.md). */
export const configKey = (userId: string): string => `config:${userId}`;

// === Content cache (date-stamped, shared across users) ===

/**
 * `{source}:{YYYY-MM-DD}` for the simple global sources:
 * `nasa-apod`, `bing-daily`, `wikimedia-potd`, `quote`, `poem`, `onthisday`,
 * `wikipedia`, `word`. Headlines and weather have their own helpers below —
 * their cache keys carry additional parameters.
 */
export const sourceKey = (source: string, date: string = formatDate()): string =>
  `${source}:${date}`;

/**
 * `headlines:{feedSetHash}:{YYYY-MM-DD}` — headlines vary by feed set, so the
 * cache key carries a hash of the feeds + count. The hash itself is computed
 * by the RSS fetcher (#6); this helper just shapes the key.
 */
export const headlinesKey = (feedSetHash: string, date: string = formatDate()): string =>
  `headlines:${feedSetHash}:${date}`;

/**
 * `weather:{lat,lon}:{YYYY-MM-DD}` — weather varies by location, not by user.
 * Coordinates are rounded to 2 decimal places (~1 km accuracy) so trivial
 * floating-point drift doesn't fragment the cache.
 */
export function weatherKey(lat: number, lon: number, date: string = formatDate()): string {
  const round = (n: number) => Math.round(n * 100) / 100;
  return `weather:${round(lat)},${round(lon)}:${date}`;
}
