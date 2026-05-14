# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

This is **not a codebase yet** — it is a **portable spec + design reference** for rebuilding
`frontdoor` as a React/Next.js app on Vercel. The only content is `design/`: seven markdown
docs plus `theme.css`. There is no source code, no `package.json`, and no build/lint/test
commands. The expected first task is to scaffold the Next.js app *from* these specs.

`design/` is self-contained and is the build target. Read it in order before writing code:

| File | What it pins down |
|------|-------------------|
| `01-layout-philosophy.md` | The 6 fixed sections and their ordering — the core IP |
| `02-aesthetic-and-rendering.md` | The "dense, calm, zero-framework-feel" look and the RSC strategy |
| `03-widget-specs.md` | The 7 widget types and their config shapes / render contracts |
| `04-data-sources.md` | Every external API — endpoints, auth, parsing quirks, fallbacks |
| `05-config-schema.md` | The per-user dashboard JSON that replaces the old YAML |
| `06-architecture.md` | Next.js / Vercel / KV / cron / API-key architecture |
| `theme.css` | The dark theme — ports in nearly as-is; keep the CSS variables |

## The product in one line

A local browser start page: dense, calm, one screen. Widgets are arranged by the
**psychology of how you consume information at the start of a session**, not by widget type.

## Non-negotiable constraints (these *are* the product — don't drift)

- **The 6-section arc is fixed and ordered:** Arrive → Act → Reward → Read → Discover →
  Depart. Users may reorder widgets *within* a section; they may never reorder or rename
  sections. Urgency decreases down the page; text and image sections alternate.
- **Zero-framework-feel.** The output must feel like a static document. Achieve this by
  making **all 7 widgets React Server Components** — they ship zero client JS. The *only*
  client components are `<Clock/>` (1s tick) and `<SearchBar/>` (keydown + shortcut
  routing). Client bundle stays in single-digit KB.
- **No client-side data fetching for content.** All external data is fetched server-side
  and cached daily. A page load makes zero API calls and has no spinners/skeletons/layout
  shift on the hot path.
- **No CSS framework, no component library, no icon font.** Plain CSS + the `theme.css`
  variables only. Icons are single literal characters set in the config (`◆ ❝ ◷ ▤ ◈ ✦ ⊞`).
- **No motion** beyond the clock tick and subtle hover transitions. No red, no badges, no
  saturated color — accents are muted pastels used only as highlights.

## Architecture (target state — see `06-architecture.md`)

- **Per-user config** is one JSON document (schema in `05-config-schema.md`), validated
  with **Zod**, stored in Vercel KV as `config:{userId}`. It replaces the old YAML files.
  Sections are first-class (widgets nested under sections); the old `type: section`
  divider widget disappears as a config concern.
- **API-key auth via `middleware.ts`:** `?key=` is bootstrap-only — validate against KV
  (`key:{apiKey}` → `userId`), set an `httpOnly` cookie, redirect to a clean URL. The
  cookie is the real session; the query param leaks via logs/history/`Referer`.
- **Two caching strategies:**
  - *Eager* — Vercel Cron hits `/api/refresh` (protected by `CRON_SECRET`), re-fetches all
    **global** sources (RSS, NASA APOD, Bing, Wikimedia, quote, poem, onthisday, wikipedia,
    word), fans out with `Promise.allSettled`, writes date-stamped KV keys. Global data is
    cached **once and shared across all users**.
  - *Lazy* — `fetch(url, { next: { revalidate: 86400 } })` for **weather**, the only
    per-location (not per-user) data.
  - On any KV miss or API failure, fall back to a live fetch then to stale data — never
    show an error that breaks the page. Each widget degrades independently.
- **Shortcut map** is built at render time by walking every `links`/`launcher` widget for
  `key` fields, deduped (warn on collision), passed to `<SearchBar/>` as a prop (this
  replaces the old `window.FRONTDOOR_SHORTCUTS`).

## Gotchas called out in the specs

- **Geolocation:** never IP-geolocate (`ipapi.co`) from a serverless function — it returns
  Vercel's datacenter. Store `lat`/`lon` in user config, or use Vercel edge `request.geo`.
- **NASA APOD** is sometimes a video (`media_type != "image"`) — treat as unavailable and
  fall back to cache.
- **`stoic`** and **`word`** are deterministic by day-of-year; `stoic` is fully offline (a
  built-in ~31-quote list). Their source data lives in the original Python `src/widgets/
  text.py` and must be lifted verbatim — it is not inlined in the design docs.
- Headlines parsing must handle **both RSS 2.0 and Atom**, and **interleave** multiple
  feeds round-robin rather than concatenating.
- The econ/biz/science/research feed URLs are *not* in the design docs — they live in the
  original repo's `widgets/headlines-*.yml` and must be copied across for the default config.
- `text` widget bodies are `white-space: pre-wrap` — poems and on-this-day blocks rely on
  newlines.

## Fonts

`theme.css` currently `@import`s IBM Plex from Google Fonts. In the rewrite, switch to
`next/font` to self-host and drop the render-blocking import.
