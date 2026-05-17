/**
 * Date-stamped KV cache surface. Thin typed wrapper around the Upstash client
 * — every value is read/written through here so the TTL convention is one
 * place and consumers never touch redis directly.
 *
 * Convention: 26h TTL — gives the 0300 UTC cron a 2h window to re-warm
 * before any value's expiry, so a missed cron tick doesn't immediately
 * cause cache misses across the board.
 *
 * Storage format (#81b): values are wrapped as `{ data, fetchedAt }` so
 * `withResilience` can surface "this content is from yesterday" in the UI
 * without needing a separate per-key metadata KV entry. Older raw values
 * (written before this change) are still readable — `getCached` returns
 * `fetchedAt: null` for them, and the UI treats that as "unknown" and shows
 * no staleness caption. All caches self-heal within ~26h as TTLs expire.
 */
import { getRedis } from '@/lib/kv';
import { formatDate } from '@/lib/kv/keys';

const DEFAULT_TTL_SECONDS = 26 * 60 * 60;

/** Wrapped envelope written to KV. `fetchedAt` is `YYYY-MM-DD` UTC. */
type CachedEnvelope<T> = {
  data: T;
  fetchedAt: string;
};

/** Public read shape — `fetchedAt` is null for legacy raw values. */
export type CachedRead<T> = {
  data: T;
  fetchedAt: string | null;
};

function isEnvelope<T>(value: unknown): value is CachedEnvelope<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    'fetchedAt' in value &&
    typeof (value as { fetchedAt: unknown }).fetchedAt === 'string'
  );
}

/**
 * Returns the cached value + its `fetchedAt` date, or `null` if absent.
 *
 * Handles two storage shapes:
 *   - New (#81b+): wrapped `{ data, fetchedAt }` → fully populated read.
 *   - Legacy:     raw `T`                       → `fetchedAt: null`.
 *
 * Legacy values come from caches written before #81b. They keep working;
 * UI just won't show staleness captions until the next refresh cycle.
 */
export async function getCached<T>(key: string): Promise<CachedRead<T> | null> {
  const value = await getRedis().get<unknown>(key);
  if (value === null || value === undefined) return null;

  if (isEnvelope<T>(value)) {
    return { data: value.data, fetchedAt: value.fetchedAt };
  }

  // Legacy raw value — return with `fetchedAt: null` so the UI knows
  // "we don't know when this was fetched" and skips the stale caption.
  return { data: value as T, fetchedAt: null };
}

export type SetCachedOptions = {
  /** TTL in seconds. Default 26h. */
  ttlSeconds?: number;
  /**
   * The date this value represents — `YYYY-MM-DD` UTC. Defaults to today.
   * `withResilience` always passes this explicitly; direct callers can omit.
   */
  fetchedAt?: string;
};

/** Writes the value (wrapped with `fetchedAt`) with the configured TTL. */
export async function setCached<T>(
  key: string,
  value: T,
  options: SetCachedOptions = {},
): Promise<void> {
  const envelope: CachedEnvelope<T> = {
    data: value,
    fetchedAt: options.fetchedAt ?? formatDate(),
  };
  const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  await getRedis().set(key, envelope, { ex: ttl });
}
