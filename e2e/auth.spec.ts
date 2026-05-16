import { expect, test } from '@playwright/test';

/**
 * Auth flow E2E — the full middleware contract under PR #45.
 *
 * Uses the seed-test-user fixture (global-setup) — the known apiKey
 * `deadbeefdeadbeefdeadbeefdeadbeef` and slug `deadbeef`.
 *
 * Skips when KV isn't configured (CI without env vars).
 */
const SEED_KEY = 'deadbeefdeadbeefdeadbeefdeadbeef';
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
