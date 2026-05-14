# Config schema — the per-user dashboard

In the original, the dashboard is a set of YAML files: `widgets/dashboard.yml` is a
manifest listing widget files, each widget is its own `widgets/*.yml`. In the rewrite,
**one JSON document per user** replaces all of it, stored in a KV store keyed by the
user's API key (see `06-architecture.md`).

## Top-level shape

```jsonc
{
  "title": "frontdoor",
  "version": "1.0",
  "grid": { "columns": 4 },
  "theme": "dark",
  "sections": [
    {
      "id": "arrive",
      "title": "Good Morning",
      "subtitle": "pause before you begin",
      "widgets": [ /* widget objects */ ]
    }
    // ... 5 more sections, in fixed order
  ]
}
```

### Why `sections` is an array of sections (not a flat widget list)

The original flattens everything into one `widgets:` list and uses `type: section`
entries as in-band dividers. The rewrite should make sections **first-class** —
nesting widgets under sections — because:
- the 6-section order is fixed product structure (see `01-layout-philosophy.md`),
- it lets the editor UI reorder widgets *within* a section without letting users
  break the arc,
- the `section` widget type then disappears as a config concern (the section header
  is rendered from the section object itself).

Keep `id` as one of the fixed six: `arrive` `act` `reward` `read` `discover`
`depart`.

## Widget object

Every widget is `{ type, ...common, ...typeSpecific }`. Common fields:

```jsonc
{
  "type": "links",          // links|launcher|headlines|weather|image|text
  "title": "Morning",
  "color": "amber",         // cyan|blue|violet|rose|amber|green
  "icon": "◑",              // single literal character
  "span": 1                 // 1–4
}
```

Type-specific fields — full detail in `03-widget-specs.md`:

```jsonc
// links
{ "type": "links", "links": [
    { "name": "NYT", "url": "https://nytimes.com", "key": "ny", "tag": "news" }
]}

// launcher
{ "type": "launcher", "columns": 12, "apps": [
    { "name": "ChatGPT", "url": "https://chat.openai.com", "key": "cg", "icon": null }
]}

// headlines
{ "type": "headlines", "count": 7, "feeds": [
    { "url": "https://techcrunch.com/feed/", "name": "TC" }
]}

// weather
{ "type": "weather", "lat": 40.71, "lon": -74.01 }

// image
{ "type": "image", "source": "nasa-apod" }
// or static:
{ "type": "image", "source": "static",
  "url": "...", "caption": "...", "description": "...", "link": "..." }

// text
{ "type": "text", "source": "stoic" }   // quote|stoic|poem|onthisday|wikipedia|word
```

## Validation

Validate the config on write (and ideally on read) with a schema — **Zod** is the
natural choice in a Next.js/TS project. Rules worth enforcing:

- `sections` must be exactly the 6 known ids, in order.
- `color` ∈ the 6-color enum; `span` ∈ 1–4.
- `type` ∈ the 6 widget types; type-specific required fields present
  (`links[].name/url`, `feeds[].url/name`, `image.source`, `text.source`, …).
- `key` shortcut values should be unique across the whole config — warn or reject
  on collision (the original just warns at build time).
- URLs are well-formed and `http(s)`.

## Migration from the YAML

A one-time script converts the original `widgets/dashboard.yml` + `widgets/*.yml`
into one default-config JSON:
1. Read `dashboard.yml`'s `widgets:` list in order.
2. Walk it; each `type: section` entry starts a new section, following widgets are
   nested under it.
3. Resolve each `- file: x.yml` to its widget config, drop into the current section.
4. Map section titles to the fixed ids (`Good Morning` → `arrive`, etc.).
5. Emit the JSON above. This becomes the **default dashboard** every new user is
   seeded with.

## Defaults

A new API key should be provisioned with the full v1 dashboard as its config (the
migration output above), so a user pointing their browser at the app with a fresh
key immediately sees a complete, working start page — then edits from there.
