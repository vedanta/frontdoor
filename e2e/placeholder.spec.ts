import { expect, test } from '@playwright/test';

/**
 * Sanity E2E for the public landing page. The widget demo moved to /fd/[slug]
 * behind the auth middleware (#20); / is now the "enter your key" page.
 * The full signup → cookie → /fd/{slug} → widgets path is the #27 suite.
 */
test('root route renders the enter-your-key landing', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.logo').first()).toContainText('frontdoor');
  await expect(page.getByRole('heading', { name: /enter your key/i })).toBeVisible();
  await expect(page.getByPlaceholder('your key')).toBeVisible();
  // The signup curl hint should be present
  await expect(page.getByText(/curl -X POST \/api\/keys/)).toBeVisible();

  // Theme variable is defined (sanity that theme.css loaded)
  const bg = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--bg-deep').trim(),
  );
  expect(bg).toBe('#0a0e17');
});
