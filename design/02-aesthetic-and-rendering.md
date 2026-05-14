# Aesthetic & rendering — "dense, calm, zero-framework-feel"

The look is the product as much as the layout. Three words govern every decision.

## The three principles

### Dense
Information-rich, but not cluttered. Small type (13px base), tight line-height where
it's a list, generous where it's prose. Many things visible at once, no scrolling
hunt. The whole dashboard fits roughly one to two screens. Whitespace is used as
*separation*, not as padding-for-its-own-sake.

### Calm
Dark, low-contrast, no motion that isn't meaningful. The only animation is the clock
ticking and subtle hover transitions (0.2–0.3s ease). No carousels, no autoplay, no
notification badges, no red. Accent colors are muted pastels, never saturated. The
ambient background is two barely-visible radial gradients and a faint dot grid — you
shouldn't consciously notice them.

### Zero-framework-feel
The output should feel like a **static document**, not a web app. No loading spinners
on the hot path (data is pre-fetched and cached). No layout shift. No client-side
fetching for content. No visible hydration flash. The page is *there* the instant it
paints. The current build literally ships one self-contained HTML file — the rewrite
won't, but it must *feel* like it still does.

## How to keep "zero-framework-feel" in Next.js

This is the key tension: React/Next is a framework, and the original ethos is "no JS
framework." Resolve it with **React Server Components** doing nearly all the work.

| Concern | Approach |
|---------|----------|
| Widget rendering | **All widgets are Server Components.** They render to HTML on the server with zero client JS shipped. `links`, `launcher`, `headlines`, `weather`, `image`, `text`, `section` are all static markup once rendered. |
| Data fetching | Server-side only, in the RSC tree, reading from the daily cache (see `06-architecture.md`). The browser never fetches content. |
| Client JS | Only **two** tiny client components: the **clock** (ticks every 1s) and the **search bar** (keydown handling + shortcut routing). That's the entire client bundle. Status bar uptime can also be client, or dropped. |
| Hydration | Because only clock + search are interactive, hydration is near-instant and invisible. Everything else is inert HTML. |
| CSS | Ship `theme.css` as a global stylesheet plus per-widget CSS. **Do not** introduce Tailwind/CSS-in-JS — it works against the "static document" feel and bloats the payload. Keep plain CSS, keep the CSS variables. |
| Fonts | IBM Plex Sans + IBM Plex Mono. Currently `@import` from Google Fonts; in the rewrite use `next/font` to self-host and avoid the render-blocking import. |

Target: **the content of the page is 100% server-rendered HTML + CSS.** Client JS is
measured in single-digit kilobytes and touches only the clock and the search input.

## Visual system (from `theme.css` — see that file for exact values)

- **Background:** near-black navy `#0a0e17`, layered surfaces `#0f1520` / `#131a28`.
- **Text:** three levels — primary `#d0dce8`, secondary `#8494a7`, dim `#56687d`.
  Use the dim level liberally for metadata, attributions, source labels.
- **Accents:** six muted pastels — `cyan #4ecdc4`, `blue #6b9cf0`, `violet #a78bfa`,
  `rose #f472b6`, `amber #fbbf24`, `green #34d399`. Each widget picks one via
  `color:`. Accent shows up only in the panel icon chip and on hover.
- **Panels:** `.panel` — rounded 10px card, transparent border that lights up on
  hover, a thin gradient top-edge that fades in on hover. Restrained.
- **Panel header:** a small colored icon chip + an uppercase, wide-letter-spaced,
  mono, 10px title. Every content widget has this header.
- **Section dividers:** mono uppercase title + a gradient hairline + optional
  subtitle. Full-width, transparent, no card.
- **Type:** IBM Plex Sans for content, IBM Plex Mono for anything
  structural/metadata (logo, clock, titles, tags, keys, source labels).
- **Texture:** fixed dot-grid overlay at 0.12 opacity; two fixed radial-gradient
  glows. All `pointer-events: none`, all `z-index: 0`.

## Anti-goals (things the rewrite must NOT do)

- No skeleton loaders / spinners on first paint.
- No client-side data fetching for widget content.
- No CSS framework, no component library, no icon font — icons are single literal
  characters (`◆ ❝ ◷ ▤ ◈ ✦ ⊞`) set in the YAML/JSON config.
- No analytics, no tracking, no cookie banner beyond what auth strictly needs.
- No motion beyond clock tick + hover transitions.
- No accent color used as a fill or a large block — accent is a *highlight*, used
  sparingly.
