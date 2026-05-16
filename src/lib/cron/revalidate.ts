/**
 * ISR revalidation helpers — call `revalidatePath('/d/{slug}')` for one or
 * all users. Used by:
 *   - /api/refresh: after warming the global cache, revalidate every user
 *   - /api/revalidate: standalone endpoint (cron or admin can hit directly)
 *   - /api/config PUT: revalidate just the editor's own page (already inline
 *     there; this module is the cron path)
 *
 * Enumeration uses the `users` SET (seeded at signup; #19).
 * Per docs/architecture.md §3.3 → Revalidation.
 */
import { revalidatePath } from 'next/cache';
import { getRedis, USERS_SET, userKey, type UserRecord } from '@/lib/kv';

export type RevalidateSummary = {
  revalidated: number;
  failed: string[]; // userIds whose user record was missing/corrupt
};

/** Revalidate one user's `/d/{slug}` page. Returns true if the slug was found. */
export async function revalidateOneUser(userId: string): Promise<boolean> {
  const user = await getRedis().get<UserRecord>(userKey(userId));
  if (!user?.slug) return false;
  revalidatePath(`/d/${user.slug}`);
  return true;
}

/** Enumerate the `users` SET and revalidate each user's page. */
export async function revalidateAllUsers(): Promise<RevalidateSummary> {
  const redis = getRedis();
  const userIds = (await redis.smembers(USERS_SET)) as string[];

  const failed: string[] = [];
  let revalidated = 0;

  // Sequential — revalidatePath is sync + cheap; parallel doesn't buy anything
  // and a long users list would slam KV with concurrent GETs.
  for (const userId of userIds) {
    try {
      const ok = await revalidateOneUser(userId);
      if (ok) revalidated++;
      else failed.push(userId);
    } catch {
      failed.push(userId);
    }
  }

  return { revalidated, failed };
}
