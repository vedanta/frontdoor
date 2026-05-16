/**
 * GET / PUT /api/config — the caller's dashboard config.
 *
 *   GET:  → 200 { config: DashboardConfig }
 *   PUT:  body = DashboardConfig (Zod-validated)
 *         → 200 { ok: true }
 *         on success: revalidates the user's /d/{slug} ISR page
 *
 * Auth: cookie (web editor) or Bearer (RN). Per-key rate-limited.
 *
 * Per docs/architecture.md §3 / §5 / §6.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { DashboardConfigSchema, type DashboardConfig } from '@/lib/config';
import { configKey, getRedis } from '@/lib/kv';
import { getSession } from '@/lib/auth';
import { keyLimiter } from '@/lib/ratelimit';

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

function rateLimited(): NextResponse {
  return NextResponse.json({ error: 'rate-limited' }, { status: 429 });
}

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return unauthorized();

  const ok = await keyLimiter().limit(session.userId);
  if (!ok.success) return rateLimited();

  const config = await getRedis().get<DashboardConfig>(configKey(session.userId));
  if (!config) {
    // shouldn't happen — config is seeded at signup — but be honest if it does
    return NextResponse.json({ error: 'config not found' }, { status: 404 });
  }
  return NextResponse.json({ config });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return unauthorized();

  const ok = await keyLimiter().limit(session.userId);
  if (!ok.success) return rateLimited();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const parsed = DashboardConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid config', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  await getRedis().set(configKey(session.userId), parsed.data);

  // Bust the caller's ISR page so the next visit re-renders with the new config.
  // (#25 makes this part of the broader cron flow; here we just hit the path.)
  try {
    revalidatePath(`/d/${session.slug}`);
  } catch {
    // revalidatePath throws if called outside a Next.js request context (i.e. in tests).
    // Production calls always have one; tests don't assert this path.
  }

  return NextResponse.json({ ok: true });
}
