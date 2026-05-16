/**
 * Auth middleware — handles `?key=` bootstrap and protects `/fd/[slug]` paths.
 *
 * Runs on the Edge runtime. Uses Upstash REST (fetch-based) so KV calls work.
 *
 * Bootstrap (`?key=…` on any matched path):
 *   1. Look up `key:{apiKey}` in KV → userId
 *   2. Load `user:{userId}` → slug
 *   3. Sign cookie with COOKIE_SECRET; set `httpOnly`, `sameSite: lax`
 *   4. Redirect to `/fd/{slug}` (strips `?key=` from the visible URL)
 *
 * Protection (`/fd/[slug]`):
 *   - Missing/invalid cookie → 302 to `/`
 *   - Cookie's slug ≠ path's slug → 302 to the user's own `/fd/{slug}` (so
 *     a user can't poke at another's route even with their own valid cookie)
 *
 * Per docs/architecture.md §3.2 + §4.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_NAME, getCookieSecret, signCookie, verifyCookie, type Session } from '@/lib/auth';
import { apiKeyKey, getRedis, userKey, type UserRecord } from '@/lib/kv';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const PROTECTED_PREFIX = '/fd/';

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const url = req.nextUrl;

  // ── ?key= bootstrap ─────────────────────────────────────────────────
  const keyParam = url.searchParams.get('key');
  if (keyParam) {
    const redis = getRedis();
    const userId = await redis.get<string>(apiKeyKey(keyParam));
    if (userId) {
      const user = await redis.get<UserRecord>(userKey(userId));
      if (user?.slug) {
        const session: Session = { userId, slug: user.slug };
        const signed = await signCookie(session, getCookieSecret());
        const dest = new URL(`/fd/${user.slug}`, url.origin);
        const res = NextResponse.redirect(dest);
        res.cookies.set(COOKIE_NAME, signed, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: ONE_YEAR_SECONDS,
        });
        return res;
      }
    }
    // Invalid key — strip the param and continue to /.
    const clean = new URL(url);
    clean.searchParams.delete('key');
    return NextResponse.redirect(clean);
  }

  // ── Protect /fd/[slug] ──────────────────────────────────────────────
  if (url.pathname.startsWith(PROTECTED_PREFIX)) {
    const cookie = req.cookies.get(COOKIE_NAME)?.value;
    const session = cookie ? await verifyCookie<Session>(cookie, getCookieSecret()) : null;
    if (!session) {
      return NextResponse.redirect(new URL('/', url.origin));
    }
    const pathSlug = url.pathname.split('/')[2] ?? '';
    if (session.slug !== pathSlug) {
      return NextResponse.redirect(new URL(`/fd/${session.slug}`, url.origin));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/fd/:slug*'],
};
