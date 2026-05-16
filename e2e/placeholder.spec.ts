import { expect, test } from '@playwright/test';

/**
 * Sanity E2E — proves the Playwright wiring and that the scaffold page renders.
 * Will be replaced/expanded by #27 (full signup → /d/{slug} → dashboard path).
 */
test('root route renders the scaffold placeholder', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'frontdoor' })).toBeVisible();
  await expect(page.getByText('scaffold ready · awaiting widgets')).toBeVisible();
});
