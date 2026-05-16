# frontdoor — MVP definition

The capabilities that constitute a shippable v1. This is the scope contract: anything
listed under **In scope** is required for MVP; anything under **Out of scope** is
explicitly deferred. Architecture for all of this lives in
[`docs/architecture.md`](./architecture.md); product rationale in [`design/`](../design).

---

## In scope

### 1. Account & signup
- Self-service signup: `POST /api/keys` with an email
- Mint API key + `userId` + non-secret `slug`
- Seed the new account with the default dashboard config
- Idempotent re-signup (same email re-sends the existing key)
- Key delivery email via Resend (from a verified domain)
- Rate limiting on signup (IP + email)

### 2. Auth & session
- Bootstrap from `?key=` on first visit → validate against KV
- Issue signed `httpOnly` cookie (carries `userId`+`slug`), redirect to `/fd/{slug}`
- Middleware: verify cookie signature, check cookie-slug matches path-slug (no KV
  round-trip on the hot path)
- "Enter your key" fallback page for missing / invalid / mismatched cookie

### 3. The dashboard page (web)
- Per-user ISR route `/fd/[slug]`, server-rendered, statically cached
- The fixed 6-section arc: Arrive → Act → Reward → Read → Discover → Depart
- Section dividers (title + subtitle + hairline)
- 4-column responsive grid (collapse at 1100px / 600px), widget `span` 1–4

### 4. Widgets — all 7 types, all React Server Components
- `links` — bookmark list with category tag pills + shortcut-key badges
- `launcher` — favicon icon grid, letter-tile fallback on favicon load failure
- `headlines` — RSS/Atom aggregator, multi-feed round-robin interleaving
- `weather` — current conditions + 3-day forecast
- `image` — picture of the day: `nasa-apod`, `bing-daily`, `wikimedia-potd`, **and
  `static`** (user-supplied fixed URL + caption)
- `text` — daily text: `quote`, `stoic`, `poem`, `onthisday`, `wikipedia`, `word`
- `section` — full-width divider (rendered from the section object)

### 5. Interactive (the entire client bundle)
- `<Clock/>` — ticking clock; **click to toggle 12h / 24h format** (#43),
  persisted in localStorage
- `<SearchBar/>` — query search + keyboard-shortcut routing
- Shortcut map built at render time from `links`/`launcher` `key` fields (dedupe +
  collision warning)
- `<StatusBar/>` — uptime + storage metric (#30); A−/A+ font-size controls (#51)
  with localStorage persistence and a `--page-font-size` CSS variable. Added late
  to MVP scope as the natural home for the font controls and to close a visible
  gap vs. `design/reference/index.html`.

### 6. Data layer & sources
- Server-side fetchers: RSS/Atom, NASA APOD, Bing daily, Wikimedia POTD, Wikipedia
  featured + onthisday, ZenQuotes, PoetryDB, Free Dictionary, Open-Meteo
- Offline/deterministic: `stoic` quote list, `word` selection (day-of-year)
- `icon.horse` favicon resolution
- Quirk handling: RSS-vs-Atom parsing, feed interleaving, APOD-video fallback,
  `User-Agent` header, timeouts
- Graceful degradation: KV miss → live fetch → stale → structured "could not load"

### 7. Caching & refresh
- KV daily content cache (date-stamped keys; `headlines` keyed by feed-set hash;
  `weather` by location)
- Vercel Cron (daily 03:00) → `/api/refresh` (warm global cache, `Promise.allSettled`
  fan-out)
- Chained `/api/revalidate` → re-render every user's ISR page (enumerated via the
  `users` set)
- Lazy per-location weather caching on miss

### 8. Config
- JSON config schema — sections + nested widgets (see
  [`design/05-config-schema.md`](../design/05-config-schema.md))
- Zod validation on write
- Default config — one-time migration from the original YAML dashboard; ships with a
  fallback weather location (NYC `40.71, -74.01`)
- `GET` / `PUT /api/config` — **curl-able, no editing UI**; `PUT` is Zod-validated and
  triggers revalidation of the user's `/fd/{slug}` page

### 9. Theme & aesthetic
- Port `theme.css` (dark, IBM Plex, panel system, dot-grid texture)
- `next/font` self-hosted fonts (drop the render-blocking `@import`)
- Per-widget CSS; no CSS framework / component library
- Hold the dense / calm / zero-framework-feel constraints (see
  [`design/02-aesthetic-and-rendering.md`](../design/02-aesthetic-and-rendering.md))

### 10. Infra & ops
- Next.js app deployed on Vercel
- Vercel KV (Upstash Redis) with all documented key spaces
- `vercel.json` cron config
- Secrets: `NASA_API_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, cookie-signing secret
- A real, email-verified domain

---

## Settled scope decisions

| Decision | Choice | Notes |
|----------|--------|-------|
| Config editing | **In** — `PUT /api/config`, no UI | Curl-able; matches the curl-signup ethos. Editor UI is post-MVP. |
| Weather geolocation | **lat/lon in config** | Deterministic, fully cacheable. Default config ships with an NYC fallback; users set their own coords via `PUT /api/config`. |
| `image` `static` source | **In** | Trivial (no fetcher, no cache); completes the image widget spec. |

---

## Out of scope (post-MVP)

The full deferred backlog — with reasons and dependencies — lives in
[`docs/post-mvp.md`](./post-mvp.md). In short:

- **Cut from the design spec:** config-editing web UI, automatic weather geolocation,
  status bar / uptime indicator. (The MVP is otherwise design-complete.)
- **Beyond the design:** React Native apps, the `/api/widget/*` JSON API, Neon + Drizzle
  migration, edge-caching of authed endpoints, admin/support tooling & analytics, ISR
  revalidation fan-out optimization.

---

## Still-open questions (don't block MVP build start)

These are flagged in [`docs/architecture.md`](./architecture.md) §8 and need answers
during the build, but don't block kickoff:

- Cron function-timeout handling for the feed fan-out (Vercel plan limit)
- ISR revalidation fan-out at scale (acceptable for small N; revisit before growth)
