/** Truncate to `maxLen` and append `…` if cut. Words aren't preserved — caller's choice. */
export function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen).trimEnd() + '…';
}

/** Yesterday's date as `YYYY-MM-DD` (UTC), for staleFallbackKey. */
export function yesterday(date: Date = new Date()): string {
  const d = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}
