import { expect, test } from '@playwright/test';

/**
 * Sanity E2E for the public landing page.
 *
 * `/` no longer renders an in-app "enter your key" form. After #26 (Option A
 * — Vercel front-door) `src/app/page.tsx` is deleted and Next's fallback
 * rewrite proxies `/` to the GitHub Pages marketing site. So the request
 * chain in `next dev` is:
 *
 *   GET /  →  Next fallback rewrite  →  https://vedanta.github.io/frontdoor/
 *
 * The full signup → cookie → /fd/{slug} → widgets path is the #27 suite.
 */
test('root route is rewritten to the GH Pages marketing site', async ({ page }) => {
  await page.goto('/');

  // Marketing-page DOM (lifted from marketing/index.html — kept here as the
  // contract the rewrite chain has to deliver).
  await expect(page).toHaveTitle(/frontdoor.*respects your attention/i);
  await expect(page.locator('.logo').first()).toContainText('frontdoor');
  await expect(page.locator('.hero h1')).toContainText(/respects your attention/i);
  // The arc is the page's structural identity — first and last steps are stable.
  await expect(page.locator('.arc-name', { hasText: 'Arrive' })).toBeVisible();
  await expect(page.locator('.arc-name', { hasText: 'Depart' })).toBeVisible();
});

test('marketing static asset paths also rewrite through', async ({ page }) => {
  // The favicon is loaded by the marketing HTML via `./favicon.svg`, which
  // resolves to /favicon.svg on whatever host serves the page. Our fallback
  // rewrite has to catch *that* too and forward to GH Pages — otherwise
  // every marketing asset 404s.
  const res = await page.request.get('/favicon.svg');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type'] ?? '').toMatch(/svg/);
});
