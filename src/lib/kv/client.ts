import { Redis } from '@upstash/redis';

/**
 * Singleton Upstash Redis (Vercel KV) client.
 *
 * Reads `KV_REST_API_URL` and `KV_REST_API_TOKEN` from env. Those are
 * auto-injected by the Vercel Marketplace Upstash integration; locally they
 * come from `vercel env pull .env.local`. See `.env.example`.
 *
 * The client is lazy — instantiated on first access — so tests can stub env
 * vars before the client is built.
 */
let _redis: Redis | undefined;

export function getRedis(): Redis {
  if (!_redis) {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) {
      throw new Error(
        'KV: missing KV_REST_API_URL or KV_REST_API_TOKEN. Run `vercel env pull .env.local` after provisioning Upstash from the Vercel Marketplace.',
      );
    }
    _redis = new Redis({ url, token });
  }
  return _redis;
}

/** Test-only: clears the cached singleton so a subsequent `getRedis()` rebuilds it. */
export function resetRedis(): void {
  _redis = undefined;
}
