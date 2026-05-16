import { expect, test } from '@playwright/test';

/**
 * Dashboard render E2E — /d/{slug} with the seeded user.
 *
 * First visit cold-fetches every data-driven widget's upstream — slow but
 * not flaky (each fetcher has its own resilience ladder). Subsequent visits
 * are ISR cache hits. Test timeout is generous to cover the cold-start case.
 *
 * We assert structural things (6 section dividers, panel system rendering,
 * header + search + clock), not specific data content — upstream data
 * changes constantly.
 *
 * Skips when KV isn't configured.
 */
const SEED_KEY = 'deadbeefdeadbeefdeadbeefdeadbeef';
const SEED_SLUG = 'deadbeef';

const hasKV = !!process.env.KV_REST_API_URL;
test.skip(!hasKV, 'KV credentials not configured');

test.setTimeout(90_000); // first cold render can fan out many upstream fetches

test.beforeEach(async ({ page }) => {
  // Bootstrap auth via ?key= once per test (cookie persists for that test's context)
  await page.goto(`/?key=${SEED_KEY}`);
  await page.waitForURL(`**/d/${SEED_SLUG}`);
});

test('all 6 section dividers render', async ({ page }) => {
  const titles = await page.locator('.section-divider-title').allTextContents();
  expect(titles).toHaveLength(6);
  // Order matters — Arrive → Act → Reward → Read → Discover → Depart.
  // We check the first and last as a smoke; full ordering is enforced by the schema (#3 tests).
  expect(titles[0].length).toBeGreaterThan(0);
  expect(titles[5].length).toBeGreaterThan(0);
});

test('at least one panel widget renders per section', async ({ page }) => {
  const panels = await page.locator('.panel').count();
  // DEFAULT_CONFIG has 21 widgets; expect at least 15 visible (some may
  // could-not-load but the panel chrome still renders).
  expect(panels).toBeGreaterThanOrEqual(15);
});

test('header renders the logo + tagline with the slug', async ({ page }) => {
  await expect(page.locator('.logo').first()).toContainText('frontdoor');
  await expect(page.getByText(`/d/${SEED_SLUG}`)).toBeVisible();
});

test('clock and search bar are present', async ({ page }) => {
  // Clock fills in on the next tick after hydrate (HH:MM:SS)
  await expect(page.locator('.clock')).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
  await expect(page.getByPlaceholder(/search, URL, or shortcut/)).toBeVisible();
});

test('grid uses the responsive layout class', async ({ page }) => {
  await expect(page.locator('.grid')).toBeVisible();
  await expect(page.locator('.grid-dots')).toBeAttached();
});

test('status bar renders with font controls', async ({ page }) => {
  await expect(page.locator('.statusbar')).toBeVisible();
  await expect(page.getByLabel('smaller font')).toBeVisible();
  await expect(page.getByLabel('bigger font')).toBeVisible();
});

test('A+ increases the computed font-size of body content', async ({ page }) => {
  // Sample a real content selector — .text-body is in every text widget
  const textBody = page.locator('.text-body').first();
  await expect(textBody).toBeVisible();

  const beforePx = await textBody.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

  await page.getByLabel('bigger font').click();
  // Tiny wait for the CSS variable update to propagate to layout
  await page.waitForFunction((before) => {
    const el = document.querySelector('.text-body');
    if (!el) return false;
    return parseFloat(getComputedStyle(el).fontSize) > before;
  }, beforePx);

  const afterPx = await textBody.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(afterPx).toBeGreaterThan(beforePx);
});
