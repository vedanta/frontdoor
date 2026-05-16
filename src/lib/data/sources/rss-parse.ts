/**
 * Format-agnostic feed parser. Handles RSS 2.0 and Atom; returns the canonical
 * `HeadlineItem[]` the headlines widget consumes.
 *
 * - RSS 2.0:  `<rss><channel><item><title>…</title><link>…</link></item></channel></rss>`
 * - Atom:     `<feed><entry><title>…</title><link href="…"/></entry></feed>`
 *
 * Per design/04-data-sources.md:
 *   - Trim whitespace.
 *   - HTML-decode titles at parse time; render layer HTML-escapes again on output.
 *   - Atom `<link>` link target is the `href` attribute, not text content.
 */
import { XMLParser } from 'fast-xml-parser';

export type HeadlineItem = {
  title: string;
  link: string;
  source: string;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
});

type RawAtomLink =
  | string
  | { href?: string; rel?: string; [k: string]: unknown }
  | Array<{ href?: string; rel?: string; [k: string]: unknown }>;

function extractAtomLink(link: RawAtomLink | undefined): string {
  if (!link) return '';
  if (typeof link === 'string') return link.trim();
  if (Array.isArray(link)) {
    // Prefer rel="alternate" if present; else first href.
    const alt = link.find((l) => l.rel === 'alternate') ?? link[0];
    return String(alt?.href ?? '').trim();
  }
  return String(link.href ?? '').trim();
}

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function htmlDecode(s: string): string {
  return s.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39|#x27);/g, (m) => HTML_ENTITIES[m] ?? m);
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

export function parseFeed(xml: string, sourceName: string): HeadlineItem[] {
  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }

  // RSS 2.0
  const rss = parsed.rss as { channel?: { item?: unknown } } | undefined;
  if (rss?.channel?.item) {
    const items = toArray(rss.channel.item) as Array<{
      title?: unknown;
      link?: unknown;
    }>;
    return items
      .map((it) => ({
        title: htmlDecode(String(it.title ?? '').trim()),
        link: String(it.link ?? '').trim(),
        source: sourceName,
      }))
      .filter((i) => i.title && i.link);
  }

  // Atom
  const feed = parsed.feed as { entry?: unknown } | undefined;
  if (feed?.entry) {
    const entries = toArray(feed.entry) as Array<{
      title?: unknown;
      link?: RawAtomLink;
    }>;
    return entries
      .map((e) => ({
        title: htmlDecode(String(e.title ?? '').trim()),
        link: extractAtomLink(e.link),
        source: sourceName,
      }))
      .filter((i) => i.title && i.link);
  }

  return [];
}
