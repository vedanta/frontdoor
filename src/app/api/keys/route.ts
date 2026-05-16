/**
 * POST /api/keys — signup.
 *
 * Body: `{ "email": "you@example.com" }`
 * Response: `202 { "status": "check your email" }` always (key never in response).
 *
 * Behavior:
 *   - Email validated; lowercased on storage / lookup.
 *   - Idempotent: a known email re-sends the existing key (no new mint).
 *   - New user: mints apiKey + userId + slug; seeds DEFAULT_CONFIG;
 *     writes every KV key space (incl. SADD users); sends email.
 *
 * See docs/architecture.md §3.1 for the canonical flow.
 * Rate-limited on both IP and email (#21).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  apiKeyKey,
  configKey,
  emailKey,
  getRedis,
  slugKey,
  USERS_SET,
  userKey,
  type UserRecord,
} from '@/lib/kv';
import { DEFAULT_CONFIG } from '@/lib/config';
import { sendKeyEmail } from '@/lib/email';
import { buildKeyUrl, mintIds } from '@/lib/signup/mint';
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

  // Idempotency: known email → re-send existing key, no new mint
  const existingUserId = await redis.get<string>(emailKey(email));
  if (existingUserId) {
    const user = await redis.get<UserRecord>(userKey(existingUserId));
    if (user?.apiKey) {
      await sendKeyEmail({
        to: email,
        key: user.apiKey,
        url: buildKeyUrl(user.apiKey, origin),
      });
      return NextResponse.json(ACCEPTED, { status: 202 });
    }
    // Corrupt user record — fall through and mint fresh. (Very unlikely.)
  }

  // New user
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

  await sendKeyEmail({ to: email, key: apiKey, url: buildKeyUrl(apiKey, origin) });

  return NextResponse.json(ACCEPTED, { status: 202 });
}
