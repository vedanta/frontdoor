# frontdoor — Post-MVP backlog

Everything deliberately deferred past v1. This is the companion to
[`docs/mvp.md`](./mvp.md): if a capability isn't in the MVP scope contract, it lives
here with the reason it was cut and what it depends on.

Two groups: **features the `design/` spec describes** but the MVP doesn't ship, and
**additions beyond the design** (introduced during architecture planning) that are
post-MVP by design.

---

## A. Cut from the design spec

Features the [`design/`](../design) docs specify that are *not* in the MVP. The MVP is
otherwise design-complete — these three are the only gaps.

### A1. Config-editing web UI
- **What:** A visual settings/editor UI to add, remove, reorder, and recolor widgets
  and edit links/feeds — without hand-writing JSON.
- **Specified in:** `design/05-config-schema.md`, `design/06-architecture.md`
  (called out there as "the big scope fork", est. +3–5 days).
- **Why cut:** The MVP ships curl-able `GET`/`PUT /api/config` instead — the editing
  *capability* exists, just not a friendly UI. This is the single substantial design
  cut.
- **Depends on:** the config Zod schema and `PUT /api/config` (both in MVP), so this is
  purely additive when picked up.

### A2. Automatic geolocation for weather
- **What:** The app determining the user's location automatically, and the dynamic
  `Weather · {City}` widget title when `lat`/`lon` aren't set.
- **Specified in:** `design/03-widget-specs.md` §4, `design/04-data-sources.md`.
- **Why cut:** The MVP requires `lat`/`lon` in the user's config (with an NYC fallback)
  — the design itself recommended "store coords in config" as the correct fix for the
  serverless IP-geolocation trap, so this is closer to a deliberate substitution than a
  pure cut. A one-time browser geolocation prompt (persisted to config) is the natural
  post-MVP version.
- **Depends on:** a small client flow + a config write-back path.

### A3. Status bar / uptime indicator
- **What:** A status bar showing uptime + lightweight system metrics (storage usage via
  `navigator.storage.estimate`, etc.), mentioned as a possible third client component
  alongside the clock and search bar.
- **Specified in:** `design/02-aesthetic-and-rendering.md` ("Status bar uptime can also
  be client, or dropped"); the original build *does* ship it — visible in
  [`design/reference/index.html`](../design/reference/index.html).
- **Why cut:** The MVP's client bundle is just `<Clock/>` + `<SearchBar/>`. The design
  itself hedged here ("or dropped"), so this is the softest of the three cuts.
- **Depends on:** nothing — purely a small client component if revived.
- **Tracked in:** [#30](https://github.com/vedanta/frontdoor/issues/30)

---

## B. Beyond the design

Capabilities introduced during architecture planning (see
[`docs/architecture.md`](./architecture.md)) that were post-MVP from the start. These
are *not* in the `design/` spec.

### B1. React Native iOS/Android apps
- Native mobile clients consuming the JSON API. The frontend/backend split and the
  per-widget endpoints exist specifically to enable this later.
- **Depends on:** B2.

### B2. `/api/widget/*` JSON endpoints
- The per-widget HTTP API (`headlines`, `weather`, `image`, `text`). The MVP web path
  doesn't need these — its ISR render reads the data layer in-process — so they're
  deferred until there's a client (B1) that does.
- **Depends on:** the MVP data layer (already built for the web render).

### B3. Neon (Postgres) + Drizzle migration
- Move the account + config domain out of KV into a real relational store once a
  concrete query need appears (admin/support views, user search, analytics). KV then
  keeps only the regenerable content cache.
- **Trigger:** the first real need to *query across* users. See `docs/architecture.md`
  §8.

### B4. Edge-caching of `Bearer`-authed endpoints
- `/api/widget/*` payloads aren't user-specific, but the `Authorization` header defeats
  default CDN caching. Needs a deliberate `Cache-Control: s-maxage` + cache-key policy.
- **Depends on:** B2 (no authed endpoints exist until then).

### B5. Admin / support tooling & analytics
- Internal views for support ("resend my key"), user lookup, signup/usage metrics.
- **Depends on:** B3 (querying across users needs the relational store).

### B6. ISR revalidation fan-out optimization
- Cron revalidating *every* user's page in one window is O(users) of render work — fine
  for small N. Strategies for scale: staggering, on-read revalidation,
  revalidate-only-active-users.
- **Trigger:** user growth. Acceptable as-is for MVP launch.

---

## Not coming back

For the record — deferred *nowhere*, because the platform change already discarded it:

- **The single portable `file://` HTML artifact.** The original frontdoor built one
  self-contained HTML file you could open locally. The rewrite is a hosted Next.js
  service; this property is gone by design, not by scoping. (See `design/README.md`,
  "discarded".)
