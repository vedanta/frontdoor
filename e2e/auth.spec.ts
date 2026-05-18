import { expect, test } from '@playwright/test';

/**
 * Auth flow E2E — the full middleware contract under PR #45.
 *
 * Uses the seed-test-user fixture (global-setup):
 *   - apiKey       `fd_deadbeefdeadbeefdeadbeefdeadbeef`  (#72 prefix; LEGACY ?key= path)
 *   - bootstrap    `fdb_deadbeefdeadbeefdeadbeefdeadbeef` (#73 — preferred ?bootstrap= path)
 *   - slug         `deadbeef`
 *
 * Skips when KV isn't configured (CI without env vars).
 */
const SEED_KEY = 'fd_deadbeefdeadbeefdeadbeefdeadbeef';
const SEED_BOOTSTRAP = 'fdb_deadbeefdeadbeefdeadbeefdeadbeef';
const SEED_SLUG = 'deadbeef';

const hasKV = !!process.env.KV_REST_API_URL;
test.skip(!hasKV, 'KV credentials not configured');

test('?key= bootstraps a cookie and 302s to /fd/{slug}', async ({ page }) => {
  await page.goto(`/?key=${SEED_KEY}`);
  await page.waitForURL(`**/fd/${SEED_SLUG}`);
  expect(page.url()).toMatch(new RegExp(`/fd/${SEED_SLUG}$`));

  // Cookie is set
  const cookies = await page.context().cookies();
  expect(cookies.some((c) => c.name === 'frontdoor_session')).toBe(true);
});

test('cookie persists: visiting /fd/{slug} again works without ?key=', async ({ page }) => {
  await page.goto(`/?key=${SEED_KEY}`);
  await page.waitForURL(`**/fd/${SEED_SLUG}`);

  await page.goto(`/fd/${SEED_SLUG}`);
  expect(page.url()).toMatch(new RegExp(`/fd/${SEED_SLUG}$`));
});

test("visiting another user's slug redirects to own slug", async ({ page }) => {
  await page.goto(`/?key=${SEED_KEY}`);
  await page.waitForURL(`**/fd/${SEED_SLUG}`);

  await page.goto('/fd/somebody-elses-slug');
  await page.waitForURL(`**/fd/${SEED_SLUG}`);
  expect(page.url()).toMatch(new RegExp(`/fd/${SEED_SLUG}$`));
});

test('/fd/{slug} without a cookie redirects to /', async ({ browser }) => {
  // Fresh context = no cookies
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/fd/${SEED_SLUG}`);
  await page.waitForURL('**/');
  expect(page.url()).toMatch(/\/$/);
  await ctx.close();
});

test('invalid ?key= strips the param and lands on /', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/?key=this-key-does-not-exist-in-kv');
  await page.waitForURL('**/');
  expect(page.url()).not.toContain('key=');
  await ctx.close();
});

// ── #73: ?bootstrap= flow (preferred path) ─────────────────────────────
//
// The seed bootstrap is SINGLE-USE — both the "first visit succeeds" and
// "second visit 410s" assertions must live in a single test that controls
// the order of use. Splitting them across tests would race on token consumption.

test('#73 ?bootstrap= first visit sets cookie + 302; second visit 410', async ({ browser }) => {
  // Fresh context — isolated from any earlier `?key=` legacy-path tests.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // First use: redirect to /fd/{slug} and set the session cookie
  await page.goto(`/?bootstrap=${SEED_BOOTSTRAP}`);
  await page.waitForURL(`**/fd/${SEED_SLUG}`);
  expect(page.url()).toMatch(new RegExp(`/fd/${SEED_SLUG}$`));
  const cookies = await ctx.cookies();
  expect(cookies.some((c) => c.name === 'frontdoor_session')).toBe(true);

  // Second use: 410 Gone (single-use semantics)
  const reuse = await ctx.request.get(`/?bootstrap=${SEED_BOOTSTRAP}`, { maxRedirects: 0 });
  expect(reuse.status()).toBe(410);
  expect((await reuse.text()).toLowerCase()).toContain('expired');

  await ctx.close();
});

test('#73 invalid ?bootstrap= returns 410', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const res = await page.request.get('/?bootstrap=fdb_does_not_exist_in_kv_at_all_nope_xx', {
    maxRedirects: 0,
  });
  expect(res.status()).toBe(410);
  await ctx.close();
});
