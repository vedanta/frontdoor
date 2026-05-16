# marketing/

The product website for frontdoor — a single-page static site served from
GitHub Pages. Visual aesthetic mirrors the product (dark, IBM Plex,
calm/dense) so the marketing surface feels like the same project.

## Files

- `index.html` — the page itself; semantic HTML, no JS
- `style.css` — palette + layout, mirrors `design/theme.css` but stripped to
  landing-page essentials
- `README.md` — this file

## Deploy

Automatic. Every push to `main` that touches `marketing/` (or this
workflow) triggers `.github/workflows/marketing-deploy.yml`, which:

1. Uploads `./marketing` as a Pages artifact
2. Calls `actions/deploy-pages@v4` → publishes to GitHub Pages

**First-time setup** (one-shot, done in the repo's web UI):

1. **Settings → Pages → Source: GitHub Actions**
2. Push something that touches `marketing/**` (this PR) — the workflow runs
3. The page is live at `https://vedanta.github.io/frontdoor/`

## Local preview

It's plain static HTML — open the file directly:

```
open marketing/index.html
```

…or serve it with any static server if you want canonical relative paths:

```
cd marketing && python3 -m http.server 4000
# → http://localhost:4000
```

## Editing

Edit `index.html` / `style.css`. The page is intentionally one screen of HTML
— no build step, no framework, no JS bundle. Keep it that way unless there's
a strong reason not to.

The deploy job only fires on `main` pushes that touch `marketing/**`, so app
PRs don't trigger redeploys.
