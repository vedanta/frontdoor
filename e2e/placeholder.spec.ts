import { expect, test } from '@playwright/test';

/**
 * Sanity E2E for the widgets-demo placeholder page (now with Clock + SearchBar).
 * Will be replaced by #27's full signup → /d/{slug} → dashboard suite once
 * the auth/page work lands.
 */
test('root route renders the widgets demo with theme + clock + search', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.logo').first()).toContainText('frontdoor');
  await expect(page.getByText('Widgets Demo', { exact: true })).toBeVisible();

  // Theme variable defined (sanity that theme.css loaded)
  const bg = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--bg-deep').trim(),
  );
  expect(bg).toBe('#0a0e17');

  // Clock fills in (HH:MM:SS) within a second
  await expect(page.locator('.clock')).toHaveText(/^\d{2}:\d{2}:\d{2}$/);

  // Search bar present
  await expect(page.getByPlaceholder(/search, URL, or shortcut/)).toBeVisible();

  // Global `/` focuses the search input
  await page.locator('body').press('/');
  await expect(page.getByPlaceholder(/search, URL, or shortcut/)).toBeFocused();
});
