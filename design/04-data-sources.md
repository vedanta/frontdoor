# Data sources — endpoints, auth, parsing, quirks

Every external call below is made **server-side** and cached **daily**. The browser
never touches these. This is reusable knowledge — the endpoints and parsing logic
survive the rewrite even though the code doesn't.

All requests send a `User-Agent: frontdoor/1.0` header (some APIs reject the default).
All have generous timeouts (5–10s) and fall back to stale cache on failure.

---

## Weather — Open-Meteo

**No API key.** Free.

**Current + forecast:**
```
GET https://api.open-meteo.com/v1/forecast
  ?latitude={lat}&longitude={lon}
  &current=temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m
  &daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max
  &temperature_unit=fahrenheit
  &wind_speed_unit=mph
  &timezone=auto&forecast_days=4
```

Response: `.current.*` for now, `.daily.*` as parallel arrays (index 0 = today,
1–3 = next days). `sunrise`/`sunset` are ISO strings like `2026-05-13T05:42`.

**WMO weather code → (description, icon)** — the lookup table:
```
0  Clear ☀          1  Mostly clear ☼     2  Partly cloudy ⛅   3  Overcast ☁
45 Fog 🌫            48 Rime fog 🌫
51 Light drizzle 🌦  53 Drizzle 🌦         55 Dense drizzle 🌦
61 Light rain 🌧     63 Rain 🌧            65 Heavy rain 🌧
71 Light snow 🌨     73 Snow 🌨            75 Heavy snow 🌨
80 Showers 🌧        81 Heavy showers 🌧   82 Violent showers 🌧
95 Thunderstorm ⛈   96 Hail storm ⛈       99 Severe storm ⛈
```
(Original uses HTML entities — `&#9728;` etc. Use real glyphs or an icon set in the
rewrite, doesn't matter, just keep the code→concept mapping.)

**Geolocation (original approach — DO NOT reuse as-is):**
```
GET https://ipapi.co/json/   → { latitude, longitude, city }
```
This geolocates the *caller's* IP. Fine for a local Python build; **wrong on Vercel**
(returns the datacenter). See `03-widget-specs.md` §4 for the fix: store coords in
user config, or use Vercel `request.geo`, or one-time client geolocation.
Hardcoded fallback in the original: NYC `40.71, -74.01`.

---

## Headlines — RSS / Atom feeds

**No API keys.** Plain HTTP GET of feed URLs, parsed as XML.

**Parsing:** handle both **RSS 2.0** and **Atom**.
- RSS 2.0: `.//item` → `<title>`, `<link>` (link is text content).
- Atom: `.//atom:entry` → `<atom:title>`, `<atom:link href="...">` (link is the
  `href` attribute). Namespace: `http://www.w3.org/2005/Atom`.
- Produce `{ title, link, source }` per item. Trim whitespace. HTML-escape titles on
  render.

**Interleaving:** group items by source, then round-robin across sources until you
have `count` items. Single feed → just take the first `count`.

**The feed list (v1 dashboard):**

| Widget | Feeds (name → url) |
|--------|--------------------|
| Top Stories | NYT `https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml` · BBC `https://feeds.bbci.co.uk/news/world/rss.xml` · NPR `https://feeds.npr.org/1001/rss.xml` |
| Tech & AI | Ars `https://feeds.arstechnica.com/arstechnica/index` · Verge `https://www.theverge.com/rss/index.xml` · TC `https://techcrunch.com/feed/` · Google AI `https://blog.google/technology/ai/rss/` · OpenAI `https://openai.com/blog/rss.xml` · HF `https://huggingface.co/blog/feed.xml` |
| Economics | *(see `widgets/headlines-econ.yml` in the original repo)* |
| Business | *(see `widgets/headlines-biz.yml`)* |
| Science | *(see `widgets/headlines-science.yml`)* |
| Research | *(see `widgets/headlines-research.yml`)* |

> The econ/biz/science/research feed URLs live in the original `widgets/headlines-*.yml`
> files. Copy them across when building the default config — they weren't all inlined
> here to keep this doc focused, but they're trivial to lift.

---

## Image sources

### NASA APOD
**API key:** `NASA_API_KEY` env var. `DEMO_KEY` works but is rate-limited — get a
free key at api.nasa.gov.
```
GET https://api.nasa.gov/planetary/apod?api_key={NASA_API_KEY}
```
Map: `image` ← `hdurl || url`, `caption` ← `title`, `description` ← `explanation`
(truncated ~120 chars), `link` ← `url`.
**Quirk:** some days APOD is a video — `media_type != "image"` → treat as
unavailable, fall back to cache.

### Bing daily
**No API key.**
```
GET https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-US
```
`img = .images[0]`. Map: `image` ← `https://www.bing.com` + `img.url`,
`caption` ← `img.title`, `description` ← `img.copyright`,
`link` ← `img.copyrightlink`.

### Wikimedia / Wikipedia "Picture of the Day"
**No API key.** Uses the Wikipedia featured-feed endpoint.
```
GET https://en.wikipedia.org/api/rest_v1/feed/featured/{YYYY}/{MM}/{DD}
```
`img = .image`. Map: `image` ← `img.thumbnail.source`,
`caption` ← `img.title` (strip `File:` prefix and the extension),
`description` ← `img.description.text` (truncated ~120 chars),
`link` ← `img.file_page`.

---

## Text sources

### `quote` — ZenQuotes
**No API key.**
```
GET https://zenquotes.io/api/today   → [ { q, a } ]
```
Map: `body` ← `q`, `attribution` ← `a`.

### `stoic` — built-in, offline
**No network.** A hardcoded list of ~31 stoic quotes (`{body, attribution}`). Pick
deterministically: `STOIC[day_of_year % len]`. The full list is in the original
`src/widgets/text.py` (`STOIC_QUOTES`) — lift it verbatim.

### `poem` — PoetryDB
**No API key.**
```
GET https://poetrydb.org/random/1   → [ { title, author, lines[] } ]
```
Take first 8 lines, join with `\n`, append `\n...` if truncated.
`attribution` ← `{author} — "{title}"`.

### `onthisday` — Wikipedia
**No API key.**
```
GET https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/{M}/{D}
```
From `.events[]` (`{year, text}`), pick 2 spread across the list (step =
`len//2`). `body` ← the 2 events joined with `\n\n` as `{year} — {text}`.
`attribution` ← `On this day — {Month D}`. Title also gets `· MM/DD` appended.

### `wikipedia` — Wikipedia featured article
**No API key.** Same featured-feed endpoint as Wikimedia POTD:
```
GET https://en.wikipedia.org/api/rest_v1/feed/featured/{YYYY}/{MM}/{DD}
```
`tfa = .tfa`. Map: `body` ← `tfa.extract` (truncated ~200 chars),
`attribution` ← `tfa.normalizedtitle`,
`link` ← `tfa.content_urls.desktop.page`.

### `word` — deterministic word + Free Dictionary API
A hardcoded ~50-word list (in the original `text.py`, `_fetch_word`). Pick
`WORDS[day_of_year % len]`, then:
```
GET https://api.dictionaryapi.dev/api/v2/entries/en/{word}
```
Map: `body` ← `[0].meanings[0].definitions[0].definition`,
`attribution` ← `{word} ({partOfSpeech}) {phonetic}`.

---

## Favicons — icon.horse

For the `launcher` widget:
```
https://icon.horse/icon/{domain}
```
No key. `{domain}` is the host of the app URL. Fall back to a letter tile on load
error. Can be overridden per-app with an explicit `icon:` URL.

---

## Caching discipline (carry this over)

- Every source above is cached with a **date-stamped key**. A second fetch on the
  same calendar day is a pure cache read — **zero API calls**.
- On API failure, **fall back to stale cache** rather than showing an error.
- Most data is **global, not per-user** (RSS, NASA, Bing, Wikimedia, quote, poem,
  onthisday, wikipedia, word). Cache it once, share across all users. Only `weather`
  varies — cache it keyed by location, not by user.
- See `06-architecture.md` for how this maps to Vercel KV + cron + Next.js data
  cache.

## Env vars / secrets

| Var | Used by | Notes |
|-----|---------|-------|
| `NASA_API_KEY` | image/nasa-apod | Optional; `DEMO_KEY` works but is rate-limited |

That's the only upstream secret. Everything else is keyless. (The per-user **API
key** for accessing the app is a separate concept — see `06-architecture.md`.)
