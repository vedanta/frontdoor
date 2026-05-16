/**
 * The resilience ladder — every source goes through this composer:
 *   1. KV hit                → return cached (fresh: false)
 *   2. miss, live fetch ok   → write KV, return live (fresh: true)
 *   3. live fails + stale    → return previous-day cached (fresh: false)
 *   4. total failure         → structured `could-not-load` payload
 *
 * Failures are never written to cache (don't poison future reads).
 *
 * See docs/architecture.md §6 → Resilience for the why.
 */
import { getCached, setCached } from './cache';
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
  // 1. cache hit
  const cached = await getCached<T>(key);
  if (cached !== null) {
    return { ok: true, data: cached, fresh: false };
  }

  // 2. live fetch
  const live = await options.fetcher();
  if (live.ok) {
    await setCached(key, live.data, { ttlSeconds: options.ttlSeconds });
    return live;
  }

  // 3. stale fallback (if a stale key was provided)
  if (options.staleFallbackKey) {
    const stale = await getCached<T>(options.staleFallbackKey);
    if (stale !== null) {
      return { ok: true, data: stale, fresh: false };
    }
  }

  // 4. structured failure
  return { ok: false, reason: `could-not-load: ${live.reason}` };
}
