import { expect, test } from '@playwright/test';

/**
 * /api/user E2E (#69) — GET + PUT against the seed user.
 *
 * DELETE is INTENTIONALLY NOT covered here — it would wipe the seed user that
 * other E2E specs (auth.spec.ts, dashboard.spec.ts, etc.) rely on. DELETE has
 * comprehensive Vitest coverage in `src/app/api/user/route.test.ts` (8 tests:
 * 401/400/404 branches, confirmEmail mismatch, KV wipe, cookie clear, SREM).
 *
 * Uses the seed fixture from global-setup.ts: known apiKey `deadbeef…` /
 * slug `deadbeef`. Skipped when KV isn't configured (CI without env vars).
 */

// Mirrors the DEFAULTS in `scripts/seed-test-user.ts`. Kept in sync by
// convention — if either side changes, update both.
const SEED_KEY = 'deadbeefdeadbeefdeadbeefdeadbeef';
const SEED_SLUG = 'deadbeef';
const SEED_EMAIL = 'dev@frontdoor.app';
const SEED_NAME = 'dev user';
const SEED_TZ = 'America/New_York';

const hasKV = !!process.env.KV_REST_API_URL;
test.skip(!hasKV, 'KV credentials not configured');

test.beforeEach(async ({ page }) => {
  // Bootstrap a cookie via the existing ?key= flow, then drop the query
  // before exercising the API.
  await page.goto(`/?key=${SEED_KEY}`);
  await page.waitForURL(`**/fd/${SEED_SLUG}`);
});

test('GET /api/user returns the full seeded record (no apiKey)', async ({ page }) => {
  const res = await page.request.get('/api/user');
  expect(res.status()).toBe(200);
  const body = await res.json();

  // Asserts every seeded field — proves the seed fixture and the GET handler
  // agree on the shape. apiKey must never appear.
  expect(body).toMatchObject({
    email: SEED_EMAIL,
    slug: SEED_SLUG,
    name: SEED_NAME,
    timezone: SEED_TZ,
  });
  expect(body).toHaveProperty('createdAt');
  expect(body).not.toHaveProperty('apiKey');
});

test('PUT /api/user updates name + timezone; reflected on subsequent GET', async ({ page }) => {
  // Use a timestamped value so this test is robust to re-runs (no
  // cross-test contamination via the persistent seed user). The afterEach
  // restores the seeded defaults so later specs that read the seed user
  // (e.g. dashboard tests) see the pristine values.
  const newName = `e2e-user-${Date.now()}`;
  const newTz = 'UTC';

  const put = await page.request.put('/api/user', {
    data: { name: newName, timezone: newTz },
  });
  expect(put.status()).toBe(200);
  const putBody = await put.json();
  expect(putBody).toMatchObject({ name: newName, timezone: newTz });

  const get = await page.request.get('/api/user');
  expect(get.status()).toBe(200);
  const getBody = await get.json();
  expect(getBody).toMatchObject({ name: newName, timezone: newTz });
});

test.afterEach(async ({ page }) => {
  // Restore seeded defaults so subsequent specs see the pristine seed user.
  // Best-effort: ignore failures (e.g. fresh-context tests with no cookie
  // will 401 here — that's the no-cookie test's invariant, not a problem).
  await page.request
    .put('/api/user', { data: { name: SEED_NAME, timezone: SEED_TZ } })
    .catch(() => {});
});

test('PUT /api/user with unknown field is 400 (strict Zod)', async ({ page }) => {
  const res = await page.request.put('/api/user', {
    data: { email: 'attacker@example.com' },
  });
  expect(res.status()).toBe(400);
});

test('GET /api/user without a cookie is 401', async ({ browser }) => {
  // Fresh context = no cookies; bypass beforeEach.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const res = await page.request.get('/api/user');
  expect(res.status()).toBe(401);
  await ctx.close();
});
