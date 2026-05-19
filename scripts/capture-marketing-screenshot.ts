#!/usr/bin/env tsx
/**
 * Capture a marketing-quality screenshot of the dashboard for the public
 * site (./marketing/screenshot.png).
 *
 * Renders the seed dev user's dashboard via the local dev server at
 * Retina 2× density, viewport-only (no full-page scroll capture — the
 * marketing screenshot is meant to show "what you see the moment you open
 * a new tab"). Output writes to marketing/screenshot.png.
 *
 * Requires the local dev server to be running on :3000. Run:
 *   ./fd.sh local server start
 *   pnpm tsx scripts/capture-marketing-screenshot.ts
 *
 * The marketing-deploy.yml workflow does NOT regenerate this image —
 * checked-in PNG is the source of truth. Re-run this script whenever the
 * dashboard's visual identity changes meaningfully.
 */
// We pull `chromium` from `@playwright/test` rather than `playwright` — the
// project only declares `@playwright/test`, and re-exports the same browser
// types. Avoids an extra dependency.
import { chromium } from '@playwright/test';

const SEED_KEY = 'fd_deadbeefdeadbeefdeadbeefdeadbeef';
const URL = `http://localhost:3000/?key=${SEED_KEY}`;
const OUT = 'marketing/screenshot.png';

// 1440x900 is the "MacBook Pro 14" logical viewport; at deviceScaleFactor:2
// the resulting PNG is 2880x1800 — sharp on Retina, downscales cleanly.
const VIEWPORT = { width: 1440, height: 900 } as const;
const DEVICE_SCALE = 2;

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE,
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  await page.goto(URL, { waitUntil: 'domcontentloaded' });

  // Wait for the cookie redirect (key=... → /fd/<slug>) to settle and for
  // every widget to finish rendering. networkidle is the right gate here —
  // weather + image widgets fetch external resources on first render.
  await page.waitForLoadState('networkidle', { timeout: 30_000 });

  // Tiny pause so the clock-tick lands on a stable second; without this
  // the clock occasionally captures mid-transition.
  await page.waitForTimeout(500);

  await page.screenshot({
    path: OUT,
    fullPage: false,
    type: 'png',
  });

  await browser.close();
  console.log(`✓ wrote ${OUT}  (${VIEWPORT.width}×${VIEWPORT.height} @ ${DEVICE_SCALE}×)`);
}

main().catch((err) => {
  console.error('capture failed:', err);
  process.exit(1);
});
