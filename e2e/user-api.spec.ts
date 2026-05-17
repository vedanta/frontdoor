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

const SEED_KEY = 'deadbeefdeadbeefdeadbeefdeadbeef';
const SEED_SLUG = 'deadbeef';

const hasKV = !!process.env.KV_REST_API_URL;
test.skip(!hasKV, 'KV credentials not configured');

test.beforeEach(async ({ page }) => {
  // Bootstrap a cookie via the existing ?key= flow, then drop the query
  // before exercising the API.
  await page.goto(`/?key=${SEED_KEY}`);
  await page.waitForURL(`**/fd/${SEED_SLUG}`);
});

test('GET /api/user returns sanitized record (no apiKey)', async ({ page }) => {
  const res = await page.request.get('/api/user');
  expect(res.status()).toBe(200);
  const body = await res.json();

  expect(body).toMatchObject({ slug: SEED_SLUG });
  expect(body).toHaveProperty('email');
  expect(body).toHaveProperty('createdAt');
  expect(body).not.toHaveProperty('apiKey');
});

test('PUT /api/user updates name + timezone; reflected on subsequent GET', async ({ page }) => {
  const newName = `e2e-user-${Date.now()}`;
  const newTz = 'America/New_York';

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
