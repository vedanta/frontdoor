# Architecture — Next.js / Vercel / API-key / cron

The core shift: **build-time → request-time**, and **single-user files → multi-user
store**.

## Old → new mapping

| Today (Python static build) | Rewrite (Next.js on Vercel) |
|---|---|
| `widgets/*.yml` files in repo | Per-user config JSON in a KV store, keyed by API key |
| `build.py` + importlib renderers | React Server Components, one per widget type |
| `src/widgets/*.py` (`css/html/js/shortcuts`) | `components/widgets/*.tsx` |
| `.cache/` daily file cache | Vercel KV (warmed by cron) + Next.js Data Cache |
| `src/theme.css` | Global CSS, kept nearly as-is |
| `src/engine.js` (clock, search, status) | Two small client components: clock + search |
| launchd 3am build | Vercel Cron hitting `/api/refresh` |
| `.env` (`NASA_API_KEY`) | Vercel env var (shared secret) |
| — | **Per-user API key = access token** (new concept) |

## Request flow

```
GET /?key=abc123
  → middleware.ts: validate key → resolve userId → set httpOnly cookie
  → app/page.tsx (Server Component): load user config JSON from KV
  → render 6 sections; each widget is an RSC that reads pre-warmed data from KV
  → stream HTML; client bundle hydrates only <Clock/> and <SearchBar/>
```

## Components

### Config store — Vercel KV (Redis)
Two key spaces, no relational DB needed for v1:
- `key:{apiKey}` → `userId`
- `config:{userId}` → the dashboard JSON (see `05-config-schema.md`)

### API-key auth — `middleware.ts`
- Accept the key from `?key=` on first hit, validate against KV, then set an
  `httpOnly` cookie and **redirect to clean URL**. Subsequent loads use the cookie.
- ⚠️ Query-param keys leak via logs, browser history, and `Referer` headers — the
  URL key is bootstrap-only; the cookie is the real session.
- Invalid/missing key → a minimal "enter your key" page, not a crash.

### Data layer — two caching strategies
| Strategy | Mechanism | Used for |
|---|---|---|
| **Eager (cron-warmed)** | Vercel Cron → `/api/refresh` re-fetches and writes date-stamped keys into KV | **Global** data: all RSS, NASA APOD, Bing, Wikimedia, quote, poem, onthisday, wikipedia, word |
| **Lazy (on-demand)** | `fetch(url, { next: { revalidate: 86400 } })` | **Per-location** data: weather (can't pre-warm every user's location) |

On a KV miss (cron failed / cold key), fall back to a live fetch, then to stale data
— same resilience the original `.cache/` fallback gives.

> Global data is cached **once and shared across all users** — weather is the only
> thing that varies, and it varies by location, not by user. This keeps cache hit
> rates high regardless of user count.

### Cron — `vercel.json`
```jsonc
{ "crons": [ { "path": "/api/refresh", "schedule": "0 3 * * *" } ] }
```
`/api/refresh` re-fetches every global source, fans out with `Promise.allSettled`
(isolate per-feed failures, stay under the function timeout), writes
`{source}:{YYYY-MM-DD}` keys into KV. Protect it with the `CRON_SECRET` bearer token
Vercel sends automatically — it must not be publicly triggerable.

### Widgets — all Server Components
See `02-aesthetic-and-rendering.md`. Only `<Clock/>` and `<SearchBar/>` are client
components. The search shortcut map is built at render time by walking the user's
`links`/`launcher` widgets and passed to `<SearchBar/>` as a prop (replaces
`window.FRONTDOOR_SHORTCUTS`).

## Geolocation

`ipapi.co` from a serverless function returns Vercel's datacenter, not the user.
Options, in order of preference:
1. Store `lat`/`lon` (or a city) in the user's config — explicit, cacheable.
2. Use Vercel's edge `request.geo` ({ city, latitude, longitude }) in middleware.
3. One-time browser geolocation prompt, persisted to config.

## Effort

Roughly **2–3 weeks** for one developer for a solid v1.

| Task | Est. |
|---|---|
| Next.js scaffold + Vercel deploy | 0.5d |
| Config store (KV) + YAML→JSON migration script | 1–2d |
| API-key middleware + cookie handoff | 1d |
| Port `theme.css` + clock/search client components | 1d |
| Port 7 widget renderers to RSC | 3–5d |
| Server-side data fetchers + KV caching layer | 2–3d |
| Cron `/api/refresh` + secret | 0.5d |
| Geolocation rework | 0.5d |
| Polish, testing, env config | 1–2d |
| **Subtotal (no config-editing UI)** | **~10–15d** |
| **Optional: config-editing web UI** | **+3–5d** |

### The big scope fork
**How do users create/edit their dashboard?**
- *Cheap:* they POST a JSON blob, or you provision it manually. Keeps it ~2 weeks.
- *Real product:* a settings UI to add/reorder widgets, links, feeds, colors. Adds a
  week and is the bulk of "making it an app."

A new key is seeded with the full v1 dashboard as its default config, so even with no
editing UI, pointing a browser at the app with a fresh key shows a complete start
page immediately.

## Notable risks / decisions

- **Query-param key leakage** — mitigated by the cookie handoff above.
- **Per-user vs global caching** — get this split right or you'll hammer RSS sources
  N times and blow cache hit rates.
- **Cron timeout** — many feeds serially can exceed the function limit; fan out.
- **Philosophical drift** — React/Next contradicts the original "no JS framework"
  ethos. RSC keeps the *output* static-feeling (near-zero client JS); hold that line
  hard (see `02-aesthetic-and-rendering.md` anti-goals) or it stops being frontdoor.
- **Lost property:** the original ships one portable HTML file you can open over
  `file://`. The rewrite is a hosted service with uptime, env, and a store to run.
