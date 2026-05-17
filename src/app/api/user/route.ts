/**
 * /api/user — cookie-auth'd CRUD on the current user record (#69).
 *
 * Auth via `getSession()` — cookie first, then Bearer; same surface as the
 * rest of the app. All three verbs require auth (no public reads).
 *
 *   GET    → 200 { email, slug, createdAt, name?, timezone? }
 *            apiKey is NEVER returned — email is the only out-of-band channel
 *            for the key (existing `POST /api/keys` re-sends it on demand).
 *
 *   PUT    → 200 { ...updated user shape }
 *            Body: strict Zod-validated partial — `{ name?, timezone? }`.
 *            Unknown fields are 400'd to keep the surface narrow.
 *
 *   DELETE → 204, clears the session cookie
 *            Body: `{ confirmEmail: <user's own email> }`. Required so a
 *            stolen cookie alone (no email knowledge) can't wipe the account.
 *            Wipes every KV key associated with this user:
 *              `user:{id}` `config:{id}` `email:{e}` `slug:{s}` `key:{k}`
 *              and `SREM users {id}` from the USERS set.
 *
 * Mirrors the rate-limit / Zod / response shape conventions of /api/keys.
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
import { COOKIE_NAME, getSession } from '@/lib/auth';

/** Public-facing shape — `apiKey` stripped. */
type PublicUser = Omit<UserRecord, 'apiKey'>;

function sanitize(u: UserRecord): PublicUser {
  // Destructure-and-discard to ensure apiKey can never leak via Object.entries.
  const { apiKey: _stripped, ...rest } = u;
  void _stripped;
  return rest;
}

const PutBody = z
  .object({
    name: z.string().min(1).max(80).optional(),
    timezone: z.string().min(1).max(64).optional(),
  })
  .strict();

const DeleteBody = z.object({
  confirmEmail: z.string().email(),
});

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

function notFound(): NextResponse {
  return NextResponse.json({ error: 'not found' }, { status: 404 });
}

async function loadUser(userId: string): Promise<UserRecord | null> {
  return getRedis().get<UserRecord>(userKey(userId));
}

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return unauthorized();
  const user = await loadUser(session.userId);
  if (!user) return notFound();
  return NextResponse.json(sanitize(user));
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return unauthorized();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = PutBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const user = await loadUser(session.userId);
  if (!user) return notFound();

  // Shallow merge — only the keys the user sent get updated. Empty PUT body
  // is a valid no-op (returns the current record, lets clients verify state).
  const next: UserRecord = { ...user, ...parsed.data };
  await getRedis().set(userKey(session.userId), next);
  return NextResponse.json(sanitize(next));
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return unauthorized();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid json — include { "confirmEmail": "..." }' },
      { status: 400 },
    );
  }
  const parsed = DeleteBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body — include confirmEmail', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const user = await loadUser(session.userId);
  if (!user) return notFound();

  if (parsed.data.confirmEmail.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json(
      { error: 'confirmEmail does not match account email' },
      { status: 400 },
    );
  }

  // Wipe every KV space tied to this user. Order doesn't matter — issued in
  // parallel; if any individual key is missing it's a silent no-op on Redis.
  const redis = getRedis();
  await Promise.all([
    redis.del(userKey(session.userId)),
    redis.del(configKey(session.userId)),
    redis.del(emailKey(user.email)),
    redis.del(slugKey(user.slug)),
    redis.del(apiKeyKey(user.apiKey)),
    redis.srem(USERS_SET, session.userId),
  ]);

  // Clear the auth cookie. Attributes must match how middleware sets it
  // (path + sameSite + secure + httpOnly) so the browser actually overwrites
  // the existing cookie rather than creating a sibling.
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set({
    name: COOKIE_NAME,
    value: '',
    maxAge: 0,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
