/**
 * POST /api/keys — signup.
 *
 * Body: `{ "email": "you@example.com" }`
 * Response: `202 { "status": "check your email" }` (key never in response).
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
 * Local-dev bypass (#70):
 *   Body MAY include `{ "bootstrap": "<LOCAL_BOOTSTRAP_KEY>" }` to skip
 *   Resend. Only honored when NODE_ENV !== 'production' AND the value
 *   matches the `LOCAL_BOOTSTRAP_KEY` env var. In production, the bootstrap
 *   field is rejected unconditionally (defense in depth: even if the env
 *   var leaked into a prod environment, the response still 400s).
 *
 *   Bypass response: `201 { email, apiKey, url, status }`. The apiKey and
 *   bootstrap URL come back directly instead of going via email.
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
  /**
   * Local-dev Resend-bypass field (#70). Sent by `./fd.sh local user signup`.
   * Honored only when NODE_ENV !== 'production' AND value matches
   * LOCAL_BOOTSTRAP_KEY env var. Rejected with 400 in production regardless
   * of env var state.
   */
  bootstrap: z.string().optional(),
});

const ACCEPTED = { status: 'check your email' } as const;

function rateLimited(): NextResponse {
  return NextResponse.json({ error: 'rate-limited' }, { status: 429 });
}

/**
 * Validate the local-dev bypass field (#70). Returns:
 *   - `null` if no bypass attempted (normal flow)
 *   - `NextResponse` (4xx) if bypass attempted but disallowed
 *   - `true` if bypass is valid → caller should skip Resend
 */
function checkBypass(field: string | undefined): true | null | NextResponse {
  if (field === undefined) return null;
  // Production refuses the field outright. Defense in depth — even if
  // LOCAL_BOOTSTRAP_KEY somehow got into a prod env, this response prevents
  // the bypass from taking effect.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'bootstrap field not accepted in production' },
      { status: 400 },
    );
  }
  const expected = process.env.LOCAL_BOOTSTRAP_KEY;
  if (!expected || field !== expected) {
    return NextResponse.json(
      { error: 'bootstrap key mismatch or LOCAL_BOOTSTRAP_KEY not configured' },
      { status: 401 },
    );
  }
  return true;
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

  // #70: optional local-dev bypass. Decide here before rate-limiting so a
  // misconfigured bypass attempt errors immediately + consistently.
  const bypassCheck = checkBypass(parsed.data.bootstrap);
  if (bypassCheck instanceof NextResponse) return bypassCheck;
  const bypassResend = bypassCheck === true;

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
      if (bypassResend) {
        return NextResponse.json(
          {
            status: 'reissued locally (no email sent)',
            email,
            apiKey: user.apiKey,
            url,
          },
          { status: 201 },
        );
      }
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

  if (bypassResend) {
    return NextResponse.json(
      { status: 'created locally (no email sent)', email, apiKey, url },
      { status: 201 },
    );
  }

  await sendKeyEmail({ to: email, key: apiKey, url });
  return NextResponse.json(ACCEPTED, { status: 202 });
}
