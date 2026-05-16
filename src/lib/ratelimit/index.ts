/**
 * Rate limiters — Upstash Ratelimit, backed by the same KV instance.
 *
 * Three independent limiters:
 *   - `ipLimiter`    — for unauthenticated endpoints (signup), keyed by client IP
 *   - `emailLimiter` — for signup, keyed by email (anti-spam-by-stranger)
 *   - `keyLimiter`   — for authenticated endpoints, keyed by API key
 *
 * Lazy singletons — only constructed on first use so tests can stub env.
 *
 * Per docs/architecture.md §4 → Auth & signup:
 *   "POST /api/keys ... rate-limited on both IP and email"
 *   "authenticated widget and config endpoints are rate-limited per API key"
 */
import { Ratelimit } from '@upstash/ratelimit';
import { getRedis } from '@/lib/kv';

let _ip: Ratelimit | undefined;
let _email: Ratelimit | undefined;
let _key: Ratelimit | undefined;

export function ipLimiter(): Ratelimit {
  if (!_ip) {
    _ip = new Ratelimit({
      redis: getRedis(),
      // 10 signup attempts per minute per IP — generous for legit retries,
      // catches the obvious brute-force pattern.
      limiter: Ratelimit.slidingWindow(10, '1 m'),
      analytics: false,
      prefix: 'rl:ip',
    });
  }
  return _ip;
}

export function emailLimiter(): Ratelimit {
  if (!_email) {
    _email = new Ratelimit({
      redis: getRedis(),
      // 3 signup emails per address per hour — a real user does this once,
      // ever. Three covers "typo, retry, success".
      limiter: Ratelimit.slidingWindow(3, '1 h'),
      analytics: false,
      prefix: 'rl:email',
    });
  }
  return _email;
}

export function keyLimiter(): Ratelimit {
  if (!_key) {
    _key = new Ratelimit({
      redis: getRedis(),
      // 60 authed requests per minute per API key — generous for normal use,
      // catches a runaway script.
      limiter: Ratelimit.slidingWindow(60, '1 m'),
      analytics: false,
      prefix: 'rl:key',
    });
  }
  return _key;
}

/** Test-only — clear the cached singletons. */
export function resetLimiters(): void {
  _ip = undefined;
  _email = undefined;
  _key = undefined;
}

/**
 * Resolve a best-effort client IP from common forwarding headers.
 * Vercel sets `x-forwarded-for`; in dev jsdom won't, so fall back to "local".
 */
export function clientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return headers.get('x-real-ip') ?? 'local';
}
