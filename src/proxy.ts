/**
 * Auth proxy — handles `?bootstrap=…` and `?key=…` bootstraps, and protects
 * `/fd/[slug]` paths.
 *
 * Renamed from `middleware.ts` per Next 16's `proxy` file convention (#62).
 * Same runtime semantics; same matcher; same signature. The codemod is
 * `npx @next/codemod@canary middleware-to-proxy .` — we did the rename
 * manually to also sweep comment/doc references and add proxy.test.ts (#92).
 *
 * Runs on the Edge runtime. Uses Upstash REST (fetch-based) so KV calls work.
 *
 * Bootstrap order (per #73):
 *
 *   1. `?bootstrap=<fdb_…>` — PREFERRED. One-time, ~5-min TTL.
 *      - Look up `bootstrap:{token}` → { userId, slug, exp }
 *      - Hit + not-expired: sign cookie, DEL the bootstrap key, 302 /fd/{slug}
 *      - Miss / used / expired: 410 Gone (text/plain) — no info leak about which
 *
 *   2. `?key=<fd_…>` — LEGACY (kept for 60 days for emails sent pre-#73).
 *      Same lookup as before; invalid → strip param and redirect to /.
 *      TODO(#73 follow-up): remove this branch after 2026-07-17 once the
 *      bootstrap-only email flow has been in place for the migration window.
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
import {
  apiKeyKey,
  bootstrapKey,
  getRedis,
  userKey,
  type BootstrapRecord,
  type UserRecord,
} from '@/lib/kv';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const PROTECTED_PREFIX = '/fd/';

/** 410 response for an invalid/used/expired bootstrap token (#73). */
function bootstrapGone(): NextResponse {
  return new NextResponse(
    'bootstrap link expired or already used — request a new one by signing up again with your email',
    {
      status: 410,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    },
  );
}

/** Sign a cookie for `session` and attach the redirect to `/fd/{slug}`. */
async function signedRedirectTo(session: Session, origin: string): Promise<NextResponse> {
  const signed = await signCookie(session, getCookieSecret());
  const dest = new URL(`/fd/${session.slug}`, origin);
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

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const url = req.nextUrl;

  // ── ?bootstrap= (#73 — preferred path) ─────────────────────────────
  // `getRedis()` is called LAZILY inside each branch that needs KV — calling
  // it at the top of `proxy()` would throw on every page hit (incl. bare `/`
  // and cookie-only `/fd/[slug]`) when KV env is missing, which is the
  // local-dev default. Pinned by `proxy.test.ts` (#92).
  const bootstrapParam = url.searchParams.get('bootstrap');
  if (bootstrapParam) {
    const redis = getRedis();
    const record = await redis.get<BootstrapRecord>(bootstrapKey(bootstrapParam));
    if (!record || record.exp < Date.now()) {
      return bootstrapGone();
    }
    // Consume the token (single-use). If DEL fails (KV down etc.) we still
    // proceed — the token's TTL will prune it shortly. Better UX than failing.
    await redis.del(bootstrapKey(bootstrapParam));
    return signedRedirectTo({ userId: record.userId, slug: record.slug }, url.origin);
  }

  // ── ?key= (LEGACY — 60-day backwards-compat window) ─────────────────
  const keyParam = url.searchParams.get('key');
  if (keyParam) {
    const redis = getRedis();
    const userId = await redis.get<string>(apiKeyKey(keyParam));
    if (userId) {
      const user = await redis.get<UserRecord>(userKey(userId));
      if (user?.slug) {
        return signedRedirectTo({ userId, slug: user.slug }, url.origin);
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
