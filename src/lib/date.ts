/**
 * Date helpers shared across the data layer.
 *
 * `dayOfYear` is the deterministic index used by `stoic` and `word` text sources
 * (see design/04-data-sources.md) to pick a quote/word for the current day.
 */

/** Day of year (1–366) for a given date. UTC, so it doesn't drift by timezone. */
export function dayOfYear(date: Date = new Date()): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const now = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const oneDayMs = 24 * 60 * 60 * 1000;
  return Math.floor((now - start) / oneDayMs);
}
