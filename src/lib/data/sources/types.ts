/**
 * Item shapes returned by the daily-text, daily-image, and weather fetchers.
 * Widgets consume these directly via their per-source fetcher's return value.
 */

/** Picture-of-the-day item (NASA APOD, Bing, Wikimedia POTD). */
export type ImageItem = {
  /** Full-size image URL. */
  image: string;
  /** Short title shown above the description. */
  caption: string;
  /** ~120-char description shown below the caption. */
  description: string;
  /** Click-through URL (may be the image URL itself). */
  link: string;
  /** Tiny mono label at the bottom, e.g. "via NASA APOD API". */
  sourceLabel: string;
};

/** Daily-text item (quote, stoic, poem, onthisday, wikipedia, word). */
export type TextItem = {
  /** Body text. May contain newlines (poems / onthisday). */
  body: string;
  /** Attribution line, prefixed by "—" at render time. */
  attribution: string;
  /** Optional click-through on the attribution. */
  link?: string;
  /** Tiny mono label at the bottom. */
  sourceLabel: string;
  /**
   * True when served from a built-in offline fallback (upstream failed; the
   * source has a deterministic local entry). Currently set only by `word`
   * (#87). Renderer shows a small `(offline)` marker after the source label.
   */
  offline?: boolean;
};

/** Weather payload. */
export type WeatherData = {
  current: {
    tempF: number;
    feelsLikeF: number;
    code: number;
    humidity: number;
    windMph: number;
  };
  today: {
    highF: number;
    lowF: number;
    sunrise: string;
    sunset: string;
    uvMax: number;
    precipMaxPct: number;
  };
  /** 3-day forecast — days 1, 2, 3 (today excluded). */
  forecast: Array<{
    date: string;
    code: number;
    highF: number;
    lowF: number;
  }>;
};
