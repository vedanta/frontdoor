/**
 * Build the global shortcut map by walking the dashboard config's `links` and
 * `launcher` widgets for `key` fields. Pure / server-safe — runs at render
 * time and is passed to <SearchBar/> as a prop.
 *
 * Per docs/architecture.md §6 → "search shortcut map is built at render time"
 * (replaces the original `window.FRONTDOOR_SHORTCUTS` global).
 *
 * Collisions are logged via `console.warn` and the *last* occurrence wins.
 * Zod also enforces uniqueness on config writes (see src/lib/config/schema.ts),
 * so this is a belt-and-braces safety net.
 */
import type { DashboardConfig } from '@/lib/config';

export type ShortcutMap = Record<string, string>;

export function buildShortcuts(config: DashboardConfig): ShortcutMap {
  const map: ShortcutMap = {};
  const collisions = new Set<string>();

  for (const section of config.sections) {
    for (const widget of section.widgets) {
      if (widget.type === 'links') {
        for (const link of widget.links) {
          if (link.key) {
            if (link.key in map) collisions.add(link.key);
            map[link.key] = link.url;
          }
        }
      } else if (widget.type === 'launcher') {
        for (const app of widget.apps) {
          if (app.key) {
            if (app.key in map) collisions.add(app.key);
            map[app.key] = app.url;
          }
        }
      }
    }
  }

  if (collisions.size > 0) {
    console.warn('[shortcuts] collisions detected (last wins):', Array.from(collisions));
  }
  return map;
}

/**
 * Resolve a search-bar query to a target URL. Pure — easy to unit-test.
 *   1. Empty → ''
 *   2. Matches a shortcut → shortcut URL
 *   3. Looks like a URL → that URL (https:// added if scheme missing)
 *   4. Otherwise → Google search
 */
export function resolveSearchTarget(query: string, shortcuts: ShortcutMap): string {
  const q = query.trim();
  if (!q) return '';

  const lower = q.toLowerCase();
  if (shortcuts[lower]) return shortcuts[lower];

  if (/^https?:\/\//.test(q)) return q;
  if (/^[\w-]+\.\w+/.test(q)) return `https://${q}`;

  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}
