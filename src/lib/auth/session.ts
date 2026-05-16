/**
 * Session — the cookie payload + helpers for reading it from server contexts.
 *
 * Two ways to authenticate API routes:
 *   - cookie (web; via getSessionFromCookie)
 *   - Bearer `Authorization: Bearer <apiKey>` (RN; via getSessionFromBearer,
 *     resolved through KV)
 *
 * `getSession()` is the convenience helper for server components / route
 * handlers — checks cookie first, then Bearer.
 */
import { cookies, headers } from 'next/headers';
import { apiKeyKey, getRedis, userKey, type UserRecord } from '@/lib/kv';
import { verifyCookie } from './cookie';

export type Session = {
  userId: string;
  slug: string;
};

export const COOKIE_NAME = 'frontdoor_session';

export function getCookieSecret(): string {
  return process.env.COOKIE_SECRET ?? '';
}

export async function getSessionFromCookie(): Promise<Session | null> {
  const c = (await cookies()).get(COOKIE_NAME)?.value;
  if (!c) return null;
  return verifyCookie<Session>(c, getCookieSecret());
}

export async function getSessionFromBearer(): Promise<Session | null> {
  const auth = (await headers()).get('authorization');
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  const apiKey = m[1];
  const redis = getRedis();
  const userId = await redis.get<string>(apiKeyKey(apiKey));
  if (!userId) return null;
  const user = await redis.get<UserRecord>(userKey(userId));
  if (!user?.slug) return null;
  return { userId, slug: user.slug };
}

/** Cookie first, then Bearer. Returns null if neither is valid. */
export async function getSession(): Promise<Session | null> {
  return (await getSessionFromCookie()) ?? (await getSessionFromBearer());
}
