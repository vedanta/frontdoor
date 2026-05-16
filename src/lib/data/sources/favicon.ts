/**
 * Favicon resolution for the launcher widget.
 *
 * - Default: `https://icon.horse/icon/{hostname}` (no key, no rate limit, public).
 * - Per-app override: explicit `icon` URL in the widget config wins.
 * - Browser-side fallback (handled in the launcher component): if the image
 *   fails to load, show a letter tile with the first character of `name`.
 *
 * Per design/04-data-sources.md → Favicons.
 */

const ICON_HORSE = 'https://icon.horse/icon/';

/** Returns the favicon URL for the given site URL, or the override if provided. */
export function faviconUrl(url: string, override?: string): string {
  if (override) return override;
  try {
    const { hostname } = new URL(url);
    return `${ICON_HORSE}${hostname}`;
  } catch {
    // Caller passed a malformed URL — return empty so the launcher component
    // falls through to the letter-tile path.
    return '';
  }
}

/** First-letter tile fallback. Letter is uppercase; empty `name` → ?. */
export function letterTile(name: string): string {
  const ch = name.trim().charAt(0).toUpperCase();
  return ch || '?';
}
