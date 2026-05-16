/**
 * Date-stamped KV cache surface. Thin typed wrapper around the Upstash client
 * — every value is read/written through here so the TTL convention is one
 * place and consumers never touch redis directly.
 *
 * Convention: 26h TTL — gives the 0300 UTC cron a 2h window to re-warm
 * before any value's expiry, so a missed cron tick doesn't immediately
 * cause cache misses across the board.
 */
import { getRedis } from '@/lib/kv';

const DEFAULT_TTL_SECONDS = 26 * 60 * 60;

/** Returns the cached value, or `null` if absent. */
export async function getCached<T>(key: string): Promise<T | null> {
  const value = await getRedis().get<T>(key);
  return value === null || value === undefined ? null : value;
}

export type SetCachedOptions = {
  /** TTL in seconds. Default 26h. */
  ttlSeconds?: number;
};

/** Writes the value with the configured TTL. The @upstash/redis client handles JSON serialization. */
export async function setCached<T>(
  key: string,
  value: T,
  options: SetCachedOptions = {},
): Promise<void> {
  const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  await getRedis().set(key, value, { ex: ttl });
}
