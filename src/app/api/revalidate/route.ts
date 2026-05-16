/**
 * POST /api/revalidate — standalone ISR revalidation endpoint.
 *
 *   - No body / no query: revalidate every user's `/fd/{slug}`
 *   - `?userId=<id>`: revalidate just that user
 *
 * Cron-protected with the same `CRON_SECRET` bearer as /api/refresh, so it's
 * usable by automation (and by an admin running curl in a pinch).
 *
 * /api/refresh chains the revalidate-all logic in-process via the same
 * `revalidateAllUsers` helper (no internal HTTP call). This endpoint exists
 * for manual / future automation use.
 *
 * Per docs/architecture.md §3.3.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { checkCronAuth } from '@/lib/cron/auth';
import { revalidateAllUsers, revalidateOneUser } from '@/lib/cron/revalidate';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = checkCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized' }, { status: auth.status });
  }

  const userId = req.nextUrl.searchParams.get('userId');
  if (userId) {
    const ok = await revalidateOneUser(userId);
    return NextResponse.json({ ok, userId });
  }

  const summary = await revalidateAllUsers();
  return NextResponse.json({ ok: summary.failed.length === 0, ...summary });
}
