# frontdoor

**A browser start page that respects your attention.**

frontdoor is the page your browser opens to. It is dense, calm, and finished — one
screen of everything you want at the start of a session, with no feeds to scroll, no
notifications to clear, and no dopamine loop to fall into. You arrive, you get what you
need, you leave.

---

## The idea

Most start pages are either a search box and nothing else, or a widget dump organized by
*type* — all your links here, all your news there. frontdoor is organized by the
**psychology of how a person actually consumes information at the start of a session.**

The page is a short arc you read top to bottom. Each section has an emotional job:

| Section | Its job |
|---------|---------|
| **Arrive** | Calm the nervous system before the firehose — a stoic line, a quote, a word, a piece of history. |
| **Act** | Now that you're grounded, *do* — weather, top headlines, your app launcher, time-sensitive links. |
| **Reward** | A deliberate exhale — a beautiful image, nothing to parse. You earned it. |
| **Read** | Slower depth — curated daily and weekly reading, business and economics. |
| **Discover** | The rabbit hole — monthly deep-dives, a featured article, science and research. |
| **Depart** | Leave the way you arrived — a poem, a photo of the day. The page ends softly. |

Urgency decreases as you go down. The top is time-sensitive; the bottom is timeless. The
open and the close rhyme. It's a round trip, not a list.

---

## What you get

- **One screen, no scrolling fight.** The whole dashboard fits in roughly one to two
  screens. Whitespace separates; it doesn't pad.
- **Instant loads.** Every external source is fetched server-side and cached daily. Opening
  the page makes *zero* API calls and shows *zero* spinners — it's just there.
- **Dense but calm.** Small type, dark low-contrast theme, muted pastel accents. The only
  motion is the clock ticking. No red, no badges, no autoplay, no carousels.
- **A keyboard-first search bar.** Type a query to search; type a registered shortcut key
  to jump straight to a site.
- **Seven widget types** you arrange to taste:
  - `links` — bookmark lists with category tags and shortcut keys
  - `launcher` — a dense favicon grid of your apps
  - `headlines` — RSS/Atom aggregator that interleaves multiple sources
  - `weather` — current conditions + 3-day forecast
  - `image` — picture of the day (NASA APOD, Bing, Wikimedia)
  - `text` — quote / stoic line / poem / on-this-day / featured article / word of the day
  - `section` — the structural dividers of the 6-part arc

---

## Use cases

- **Your default new-tab / homepage.** Replace the browser's blank page or search box with
  something that orients you.
- **A morning ritual.** The Arrive → Depart arc is designed to be read once at the start of
  the day, not refreshed compulsively.
- **A personal dashboard.** Your links, your apps, your feeds, your weather — without an
  account on someone else's algorithm.
- **A calm alternative to the feed.** If you've removed social apps but still want news and
  discovery, frontdoor gives you the inputs without the infinite scroll.

---

## What makes it different

- **Organized by psychology, not by widget type.** The 6-section arc is the product. No
  other start page is built around the *emotional shape* of a session.
- **It feels like a static document, not an app.** No client-side data fetching, no
  loading states, no layout shift, near-zero JavaScript. The page is inert HTML the instant
  it paints.
- **Calm by construction.** The anti-goals are explicit: no motion, no notifications, no
  saturated color, no dark patterns. Restraint is enforced, not optional.
- **Daily-cache discipline.** Data refreshes once a day on a schedule. The page is never
  waiting on the network, and upstream sources are never hammered.
- **Yours to shape, within a frame.** You reorder widgets, pick colors, add links and
  feeds — but the section arc stays fixed, so you can't accidentally turn it back into a
  cluttered widget dump.

---

## Status

This repository currently holds the **design spec** for frontdoor in [`design/`](./design) —
the layout philosophy, aesthetic principles, widget specs, data sources, config schema, and
target architecture for building it as a React/Next.js app on Vercel, accessed per-user via
an API key.

| Doc | Contents |
|-----|----------|
| [`01-layout-philosophy.md`](./design/01-layout-philosophy.md) | The 6-section arc and ordering rules |
| [`02-aesthetic-and-rendering.md`](./design/02-aesthetic-and-rendering.md) | The "dense, calm, zero-framework-feel" look |
| [`03-widget-specs.md`](./design/03-widget-specs.md) | The 7 widget types and their config shapes |
| [`04-data-sources.md`](./design/04-data-sources.md) | Every external API — endpoints, auth, quirks |
| [`05-config-schema.md`](./design/05-config-schema.md) | The per-user dashboard config (JSON) |
| [`06-architecture.md`](./design/06-architecture.md) | Next.js / Vercel / API-key / cron architecture |
| [`theme.css`](./design/theme.css) | The dark theme |

See [`CLAUDE.md`](./CLAUDE.md) for build guidance.

---

## Architecture at a glance

- **Next.js on Vercel.** Every widget is a React Server Component — the content of the page
  is 100% server-rendered HTML + CSS. Only the clock and the search bar ship client JS.
- **Per-user config** is a single JSON document stored in Vercel KV, keyed by API key.
- **Two caching strategies:** global data (RSS, NASA, Bing, Wikimedia, quotes, poems, etc.)
  is warmed once a day by a Vercel Cron job and shared across all users; weather is cached
  per location on demand.
- **API-key access:** a key in the URL bootstraps an `httpOnly` cookie session; an invalid
  key shows a quiet "enter your key" page, never a crash.

Full detail in [`design/06-architecture.md`](./design/06-architecture.md).
