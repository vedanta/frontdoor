# Widget specs — the 7 types

Every widget is a Server Component. Every widget config object has a `type` field that
selects the renderer. Common fields are shared; each type adds its own.

## Common fields (all content widgets)

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `type` | enum | — | `links` `launcher` `headlines` `weather` `image` `text` `section` |
| `title` | string | per-type | Shown in the panel header, uppercased by CSS |
| `color` | enum | `cyan` | `cyan` `blue` `violet` `rose` `amber` `green` — drives the icon chip accent |
| `icon` | string | per-type | A single literal character, e.g. `◆ ❝ ◷ ▤ ◈ ✦ ⊞ W Aa` |
| `span` | number | `1` | Grid columns to span: `1`–`4` |

`section` is the exception — it has no `color`/`icon`/`span` (always full-width,
transparent).

Render contract for each widget: it produces a `.panel.panel--{color}` (optionally
`.panel--span-{n}`) containing a `.panel-header` (icon chip + title) and the
type-specific body. `section` produces a transparent full-width divider instead.

---

## 1. `links` — bookmark list

A vertical list of links with optional category tag pills and optional keyboard
shortcut badges. Used for the Morning / Daily / Weekly / Monthly bookmark widgets.

```yaml
type: links
title: Morning
color: amber
icon: "◑"
span: 1
links:
  - name: New York Times          # required
    url: https://nytimes.com      # required
    key: ny                       # optional — registers a search-bar shortcut
    tag: news                     # optional — category pill
```

- **Tags** (`tag`) are colored pills. Known tags with dedicated colors:
  `news` (amber), `tech` (cyan), `ai` (violet), `dev` (blue), `media` (rose),
  `social` (green), `biz` (amber), `finance` (green). Any other value → neutral
  "default" pill.
- **Keys** (`key`) render as a small mono badge right-aligned on the row, AND get
  collected into the global search shortcut map (see `engine` / search spec).
- Links open in a new tab.

---

## 2. `launcher` — compact icon grid

A dense grid of favicon tiles. Used for the "Apps" widget. Name shows on hover as a
tooltip; no text labels otherwise.

```yaml
type: launcher
title: Apps
color: cyan
icon: "⊞"
span: 4
columns: 12          # tiles per row inside the widget (default 4)
apps:
  - name: ChatGPT                       # required
    url: https://chat.openai.com        # required
    key: cg                             # optional — search shortcut
    icon: https://.../custom.png        # optional — overrides the auto favicon
```

- **Favicon resolution:** by default, `https://icon.horse/icon/{domain}` where
  `{domain}` is the host of `url`. `icon` overrides it with an explicit URL.
- **Fallback:** if the favicon image fails to load, show a colored square with the
  first letter of `name`. (In the original this is an `onerror` handler; in the
  rewrite, prefer a server-side check or a small client `<img onError>` — keep it
  trivial.)
- 36px icons. `key` works the same as in `links` and shows in the tooltip as
  `Name [key]`.

---

## 3. `headlines` — RSS aggregator

Pulls top N items from one or more RSS/Atom feeds, interleaves them for source
variety, renders a compact list. See `04-data-sources.md` for parsing details.

```yaml
type: headlines
title: Tech & AI
color: violet
icon: "▤"
span: 1
count: 7                # total items shown (default 5)
feeds:
  - url: https://techcrunch.com/feed/   # required — RSS 2.0 or Atom
    name: TC                            # required — short source label
```

- Each rendered row: headline title (clamped to 2 lines) + a small mono uppercase
  source label.
- **Interleaving:** if there are multiple feeds, round-robin across sources rather
  than concatenating — `count` items total, spread across feeds. With a single feed,
  just take the first `count`.
- Footer line: `via NYT, BBC, NPR` (the feed names joined).
- Fetched + cached daily server-side. Never fetched in the browser (CORS + speed).

---

## 4. `weather` — current + 3-day forecast

Open-Meteo current conditions and a 3-day forecast. No API key. See
`04-data-sources.md`.

```yaml
type: weather
title: Weather
color: blue
icon: "◈"
span: 1
lat: 40.71            # optional — if omitted, geolocate
lon: -74.01           # optional
```

Renders:
- Big current temp + WMO weather icon + description + "Feels X°".
- Detail rows: today's H/L, wind, humidity, UV index, rain probability.
- 3-day compact forecast strip (day name, icon, hi/lo) — skips today.
- Sunrise / sunset line.
- If `lat`/`lon` are absent, the title becomes `Weather · {City}` once geolocated.

**⚠️ Geolocation gotcha:** the original geolocates by server IP (`ipapi.co`). On
Vercel that returns the *datacenter* location, not the user's. In the rewrite, store
`lat`/`lon` (or a city) in the user's config, or use Vercel's edge `request.geo`, or
do a one-time client geolocation prompt. Do NOT IP-geolocate from a serverless
function.

---

## 5. `image` — picture of the day

A single image with a caption, from a daily source or a static URL. Used for NASA
APOD, Bing daily, Wikimedia POTD.

```yaml
type: image
title: NASA - Picture of the Day
color: blue
icon: "✦"
span: 2
source: nasa-apod     # nasa-apod | bing-daily | wikimedia-potd | static
# when source: static —
url: https://.../photo.jpg
caption: "..."
description: "..."
link: https://...           # click-through
```

- For the three daily sources, the renderer fetches `{image, caption, description,
  link}` server-side, cached daily. See `04-data-sources.md` for each source's
  endpoint and field mapping.
- Renders: the image (click-through to `link` if present), a caption title, a short
  description, and a tiny mono source label (`via NASA APOD API` etc.).
- NASA APOD: if the media type of the day is a video (not an image), treat as
  unavailable / fall back to cache.
- `loading="lazy"` on the `<img>`.

---

## 6. `text` — daily text

A block of "of the day" text — quote, stoic line, poem, on-this-day, Wikipedia
featured, word of the day.

```yaml
type: text
title: Stoic
color: violet
icon: "◆"
span: 1
source: stoic         # quote | stoic | poem | onthisday | wikipedia | word
```

- Renderer fetches `{body, attribution, link?}` server-side, cached daily.
- `body` is whitespace-preserved (`white-space: pre-wrap`) — poems and multi-event
  on-this-day blocks rely on newlines.
- `attribution` renders as `— {attribution}`, linked if `link` is present.
- Tiny mono source label at the bottom (`via zenquotes.io`, `from the stoics`, etc.).
- `stoic` is fully offline — a built-in 31-quote list, picked deterministically by
  day-of-year. `word` picks a word deterministically by day-of-year, then looks up
  the definition. `onthisday` auto-appends `· MM/DD` to the title.
- See `04-data-sources.md` for each source.

---

## 7. `section` — full-width divider

Not a panel — a labelled divider that separates the 6 layout sections.

```yaml
type: section
title: Good Morning
subtitle: pause before you begin    # optional
```

- Renders: mono uppercase title + a gradient hairline + optional dim subtitle.
- Always spans the full grid width. Transparent, no card, no hover.
- These are the structural bones of the layout (see `01-layout-philosophy.md`).

---

## Notes for the rewrite

- The original Python renderers each export `css() / html() / js() / shortcuts()`.
  In React: `css()` → a co-located CSS file or `<style>` collected once per type;
  `html()` → the component; `js()` → almost always empty (only clock/search need
  client JS); `shortcuts()` → a pure function that walks `links`/`apps` for `key`
  fields and contributes to the global shortcut map.
- **Shortcut collection** is a build/render-time concern: walk every `links` and
  `launcher` widget, collect `{key: url}`, dedupe (warn on collisions), and expose
  the map to the search component. In the original it's injected as
  `window.FRONTDOOR_SHORTCUTS`; in the rewrite, pass it as a prop to the search
  client component.
- Each widget renders independently and must degrade gracefully: a failed feed or a
  dead API shows a quiet "could not load" line, never breaks the page.
