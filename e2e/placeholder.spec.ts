import { expect, test } from '@playwright/test';

/**
 * Sanity E2E — proves the Playwright wiring and that the scaffold page renders
 * the ported theme correctly. Will be replaced/expanded by #27 (full signup →
 * /d/{slug} → dashboard path).
 */
test('root route renders the scaffold panel with the ported theme', async ({ page }) => {
  await page.goto('/');
  // The placeholder panel has its own h1, distinct from the .logo span.
  await expect(page.getByRole('heading', { name: 'frontdoor', level: 1 })).toBeVisible();
  // Text from the placeholder body.
  await expect(page.getByText(/theme ported · awaiting widgets/)).toBeVisible();
  // Theme is loaded: the body has the dark background. Just probe a CSS var is defined.
  const bg = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--bg-deep').trim(),
  );
  expect(bg).toBe('#0a0e17');
});
