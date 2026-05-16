/**
 * CRON_SECRET bearer check — used by /api/refresh and /api/revalidate.
 * Vercel cron requests automatically include `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Per docs/architecture.md §4 → Auth & signup → CRON_SECRET.
 */

export function checkCronAuth(req: Request): { ok: true } | { ok: false; status: 401 | 500 } {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Misconfiguration — surface as 500 so a missing secret in prod is loud.
    return { ok: false, status: 500 };
  }
  const auth = req.headers.get('authorization');
  if (!auth) return { ok: false, status: 401 };
  const m = auth.match(/^Bearer\s+(\S+)$/i);
  if (!m || m[1] !== expected) return { ok: false, status: 401 };
  return { ok: true };
}
