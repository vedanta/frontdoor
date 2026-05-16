import type { NextConfig } from 'next';

/**
 * Vercel-front-door config (Option A from #26).
 *
 * `frontdoor.barooah.io` CNAMEs to Vercel. The Vercel project serves:
 *   - `/fd/[slug]` → the dashboard (App Router, ISR)
 *   - `/api/*`     → the route handlers
 * Anything else falls through to the GitHub Pages marketing site at
 * `vedanta.github.io/frontdoor/…`. That's 1 DNS record, no extra services,
 * and the GH Pages workflow stays as the marketing origin.
 *
 * Rewrite ordering: `fallback` runs AFTER both filesystem routes (page.tsx,
 * route.ts) and dynamic routes have been checked, so an /fd/<slug> or /api/*
 * hit resolves to the app first and never reaches this rule. Marketing
 * assets (style.css, favicon.svg, og-image.svg, future /about, etc.) hit
 * nothing in the app and fall through.
 *
 * For `/` specifically: `src/app/page.tsx` was deleted so the fallback can
 * claim the root path. Signup recovery (lost cookie) goes through the
 * marketing site's signup curl, which is idempotent — re-sending an email
 * re-issues the same key.
 *
 * Middleware still runs first, so `/?key=…` is intercepted and redirected
 * to `/fd/{slug}` before the rewrite ever fires.
 */
const nextConfig: NextConfig = {
  async rewrites() {
    return {
      fallback: [
        {
          source: '/:path*',
          destination: 'https://vedanta.github.io/frontdoor/:path*',
        },
      ],
    };
  },
};

export default nextConfig;
