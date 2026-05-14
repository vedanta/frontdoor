# frontdoor — rewrite spec

This folder is a **portable spec + design reference** for rebuilding frontdoor as a
React/Next.js app hosted on Vercel, accessed per-user via an API key.

It is self-contained on purpose. Copy this folder into the new Claude Code project
and treat it as the build target. The original Python codebase becomes throwaway
reference once these docs exist.

## What's here

| File | Purpose |
|------|---------|
| `01-layout-philosophy.md` | The 6 psychology-driven sections and ordering logic — the real IP |
| `02-aesthetic-and-rendering.md` | The "dense, calm, zero-framework-feel" look, and how to keep it with RSC |
| `03-widget-specs.md` | The 7 widget types and their config shapes |
| `04-data-sources.md` | Every external API — endpoints, auth, parsing, quirks |
| `05-config-schema.md` | The per-user dashboard config (JSON), replacing the YAML files |
| `06-architecture.md` | Next.js / Vercel / API-key / cron architecture and effort |
| `theme.css` | The dark theme — drops in nearly as-is |

## The concept in one paragraph

A local browser start page: dense, information-heavy, calm. One screen, no scrolling
fight, no dopamine loops. Widgets are arranged not by type but by the *psychology of
how a person consumes information at the start of a session* — arrive, act, reward,
read, discover, depart. All external data is fetched server-side and cached daily, so
a page load is instant and makes zero API calls. The output should feel like a static
document, not an app.

## What carries over vs. what's discarded

**Carries over (the IP):**
- The 6-section layout philosophy and ordering
- `theme.css` (IBM Plex, dark, the panel system)
- The 7 widget *ideas* and their config fields
- The data-source list with endpoints and parsing quirks
- The daily-cache discipline (instant loads, zero API calls on the hot path)

**Discarded (build scaffolding that doesn't survive the platform change):**
- `build.py` and the importlib renderer loading
- The Python `css()/html()/js()/shortcuts()` renderer contract
- File-based `.cache/` and the launchd daily build
- YAML as the config format (→ JSON in a KV store)
