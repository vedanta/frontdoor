/**
 * The resilience ladder — every source goes through this composer:
 *   1. KV hit                → return cached (fresh: false)
 *   2. miss, live fetch ok   → write KV, return live (fresh: true)
 *   3. live fails + stale    → return previous-day cached (fresh: false)
 *   4. total failure         → structured `could-not-load` payload
 *
 * Failures are never written to cache (don't poison future reads).
 *
 * Since #81b: every successful result carries `fetchedAt` (`YYYY-MM-DD`)
 * so widget renderers can surface "served from yesterday's cache" via a
 * stale caption. The date comes from the cache envelope (new format) or
 * is computed as "today" for live fetches.
 *
 * See docs/architecture.md §6 → Resilience for the why.
 */
import { getCached, setCached } from './cache';
import { formatDate } from '@/lib/kv/keys';
import type { FetchResult } from './types';

export type WithResilienceOptions<T> = {
  /** Live fetcher invoked on cache miss. */
  fetcher: () => Promise<FetchResult<T>>;
  /** Optional KV key for stale fallback (e.g. yesterday's date-stamped key). */
  staleFallbackKey?: string;
  /** TTL for cache writes. Default 26h. */
  ttlSeconds?: number;
};

export async function withResilience<T>(
  key: string,
  options: WithResilienceOptions<T>,
): Promise<FetchResult<T>> {
  const today = formatDate();

  // 1. cache hit
  const cached = await getCached<T>(key);
  if (cached !== null) {
    return {
      ok: true,
      data: cached.data,
      fresh: false,
      // `fetchedAt` from the cache envelope (new format) or undefined for
      // legacy values — the UI treats undefined as "unknown, no caption."
      ...(cached.fetchedAt !== null ? { fetchedAt: cached.fetchedAt } : {}),
    };
  }

  // 2. live fetch
  const live = await options.fetcher();
  if (live.ok) {
    await setCached(key, live.data, {
      ttlSeconds: options.ttlSeconds,
      fetchedAt: today,
    });
    return { ...live, fetchedAt: today };
  }

  // 3. stale fallback (if a stale key was provided)
  if (options.staleFallbackKey) {
    const stale = await getCached<T>(options.staleFallbackKey);
    if (stale !== null) {
      return {
        ok: true,
        data: stale.data,
        fresh: false,
        ...(stale.fetchedAt !== null ? { fetchedAt: stale.fetchedAt } : {}),
      };
    }
  }

  // 4. structured failure
  return { ok: false, reason: `could-not-load: ${live.reason}` };
}
