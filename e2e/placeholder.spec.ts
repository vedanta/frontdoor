import { expect, test } from '@playwright/test';

/**
 * Sanity E2E for the widgets-demo placeholder page. Will be replaced by #27's
 * full signup → /d/{slug} → dashboard suite once the auth/page work lands.
 */
test('root route renders the widgets demo with the ported theme', async ({ page }) => {
  await page.goto('/');
  // Header logo
  await expect(page.locator('.logo').first()).toContainText('frontdoor');
  // Section divider title — case-exact to disambiguate from the lowercase tagline.
  await expect(page.getByText('Widgets Demo', { exact: true })).toBeVisible();
  // Theme variable is defined (sanity that theme.css loaded)
  const bg = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--bg-deep').trim(),
  );
  expect(bg).toBe('#0a0e17');
});
