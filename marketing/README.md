# marketing/

The product website for frontdoor — a single-page static site served from
GitHub Pages. Visual aesthetic mirrors the product (dark, IBM Plex,
calm/dense) so the marketing surface feels like the same project.

## Files

- `index.html` — the page itself; semantic HTML + a tiny inline form handler
- `style.css` — palette + layout, mirrors `design/theme.css` but stripped to
  landing-page essentials
- `screenshot.png` — full-fidelity dashboard capture used in the "See it"
  section; regenerate via
  `pnpm tsx scripts/capture-marketing-screenshot.ts` against a running
  local dev server
- `favicon.svg`, `og-image.svg` — branding assets
- `README.md` — this file

## Audience & content posture

The page is for **all levels of users**, not developers. Specifically it does
**not** link to GitHub, internal docs, the design spec, or any "view the code"
surface. The product itself is the call to action.

The signup mechanic is an **inline email form** (POSTs to `/api/keys` on the
same origin via the Vercel rewrite); a one-time link arrives by email; clicking
it lands the user on their dashboard with a session cookie. No password.

## Deploy

Automatic. Every push to `main` that touches `marketing/` (or this
workflow) triggers `.github/workflows/marketing-deploy.yml`, which:

1. Uploads `./marketing` as a Pages artifact
2. Calls `actions/deploy-pages@v4` → publishes to GitHub Pages

The page is then live at `https://vedanta.github.io/frontdoor/`, and Vercel
rewrites `https://frontdoor.barooah.io/` to that origin (so the canonical URL
is always `frontdoor.barooah.io`).

## Local preview

It's plain static HTML — open the file directly:

```
open marketing/index.html
```

…or serve it with any static server if you want the relative `/api/keys` form
post to work against a local backend:

```
cd marketing && python3 -m http.server 4000
# → http://localhost:4000
```

Note: the form POSTs to `/api/keys` relative to the current origin. From
`frontdoor.barooah.io` that resolves to the Vercel app via the rewrite. From
`localhost:4000` the form will 404 unless you proxy `/api/*` somewhere.

## Editing

Edit `index.html` / `style.css`. The page is intentionally one screen of HTML
— no build step, no framework, no JS bundle apart from ~30 lines of vanilla
form-handler. Keep it that way unless there's a strong reason not to.

The deploy job only fires on `main` pushes that touch `marketing/**`, so app
PRs don't trigger redeploys.

## Regenerating the screenshot

The screenshot is a checked-in PNG, not regenerated at deploy time. To
refresh after a meaningful product visual change:

```
./fd.sh local server start                     # if not already running
pnpm tsx scripts/capture-marketing-screenshot.ts
```

That writes `marketing/screenshot.png` at 2880×1800 (1440×900 viewport at
2× device scale). Commit the new PNG with a note about what changed.
