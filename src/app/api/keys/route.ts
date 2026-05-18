/**
 * POST /api/keys — signup.
 *
 * Body: `{ "email": "you@example.com" }`
 * Response: `202 { "status": "check your email" }` always (key never in response).
 *
 * Behavior:
 *   - Email validated; lowercased on storage / lookup.
 *   - Idempotent: a known email re-uses the existing apiKey BUT mints a
 *     FRESH bootstrap token (the old one is single-use + TTL'd; re-using it
 *     would be invalid). The long-lived apiKey is never rotated here.
 *   - New user: mints apiKey + userId + slug + bootstrapToken; seeds
 *     DEFAULT_CONFIG; writes every KV key space (incl. SADD users) plus the
 *     bootstrap:{token} entry with `BOOTSTRAP_TOKEN_TTL_SEC` expiry (#73).
 *   - Email contains the `?bootstrap=` URL (not `?key=`) — apiKey only flows
 *     through Bearer/curl from here on; the proxy keeps `?key=` for 60 days
 *     as a backwards-compat fallback for emails sent before this change.
 *
 * See docs/architecture.md §3.1 for the canonical flow.
 * Rate-limited on both IP and email (#21).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  apiKeyKey,
  bootstrapKey,
  configKey,
  emailKey,
  getRedis,
  slugKey,
  USERS_SET,
  userKey,
  type BootstrapRecord,
  type UserRecord,
} from '@/lib/kv';
import { DEFAULT_CONFIG } from '@/lib/config';
import { sendKeyEmail } from '@/lib/email';
import {
  BOOTSTRAP_TOKEN_TTL_SEC,
  buildBootstrapUrl,
  mintBootstrapToken,
  mintIds,
} from '@/lib/signup/mint';
import { clientIp, emailLimiter, ipLimiter } from '@/lib/ratelimit';

const SignupBody = z.object({
  email: z.string().email(),
});

const ACCEPTED = { status: 'check your email' } as const;

function rateLimited(): NextResponse {
  return NextResponse.json({ error: 'rate-limited' }, { status: 429 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Parse + validate body
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = SignupBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid email' }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();

  // Rate-limit by IP first (cheaper, no per-email Redis hit if we're going to reject anyway)
  const ip = clientIp(req.headers);
  const ipOk = await ipLimiter().limit(ip);
  if (!ipOk.success) return rateLimited();

  const emailOk = await emailLimiter().limit(email);
  if (!emailOk.success) return rateLimited();

  const redis = getRedis();
  const origin = req.nextUrl.origin;

  /**
   * Persist a fresh bootstrap token for an existing identity (new signup or
   * re-signup). Returns the URL to embed in the email.
   *
   * Set with Redis `EX` so the key auto-prunes; embedded `exp` field is a
   * defensive second check in the proxy.
   */
  async function issueBootstrap(forUserId: string, forSlug: string): Promise<string> {
    const token = mintBootstrapToken();
    const exp = Date.now() + BOOTSTRAP_TOKEN_TTL_SEC * 1000;
    const record: BootstrapRecord = { userId: forUserId, slug: forSlug, exp };
    await redis.set(bootstrapKey(token), record, { ex: BOOTSTRAP_TOKEN_TTL_SEC });
    return buildBootstrapUrl(token, origin);
  }

  // Idempotency: known email → re-issue a fresh bootstrap; reuse the long-lived
  // apiKey + identity (#73, design call: "fresh bootstrap only").
  const existingUserId = await redis.get<string>(emailKey(email));
  if (existingUserId) {
    const user = await redis.get<UserRecord>(userKey(existingUserId));
    if (user?.apiKey && user.slug) {
      const url = await issueBootstrap(existingUserId, user.slug);
      await sendKeyEmail({ to: email, key: user.apiKey, url });
      return NextResponse.json(ACCEPTED, { status: 202 });
    }
    // Corrupt user record — fall through and mint fresh. (Very unlikely.)
  }

  // New user — mint full identity (apiKey + ids) plus the first bootstrap.
  const { apiKey, userId, slug } = mintIds();
  const createdAt = new Date().toISOString();
  const user: UserRecord = { email, apiKey, slug, createdAt };

  await Promise.all([
    redis.set(apiKeyKey(apiKey), userId),
    redis.set(slugKey(slug), userId),
    redis.set(emailKey(email), userId),
    redis.set(userKey(userId), user),
    redis.set(configKey(userId), DEFAULT_CONFIG),
    redis.sadd(USERS_SET, userId),
  ]);

  const url = await issueBootstrap(userId, slug);
  await sendKeyEmail({ to: email, key: apiKey, url });

  return NextResponse.json(ACCEPTED, { status: 202 });
}
