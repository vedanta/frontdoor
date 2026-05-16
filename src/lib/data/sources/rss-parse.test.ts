import { describe, expect, it } from 'vitest';
import { parseFeed } from './rss-parse';

const RSS_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example News</title>
    <item>
      <title>Headline 1 &amp; more</title>
      <link>https://example.com/a</link>
    </item>
    <item>
      <title>Headline 2</title>
      <link>https://example.com/b</link>
    </item>
  </channel>
</rss>`;

const ATOM_SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom Feed</title>
  <entry>
    <title>Atom Headline 1</title>
    <link href="https://example.com/x"/>
  </entry>
  <entry>
    <title>Atom Headline 2</title>
    <link href="https://example.com/y" rel="alternate"/>
    <link href="https://example.com/y/self" rel="self"/>
  </entry>
</feed>`;

describe('parseFeed', () => {
  it('parses RSS 2.0 items', () => {
    const items = parseFeed(RSS_SAMPLE, 'EX');
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      title: 'Headline 1 & more', // & entity decoded
      link: 'https://example.com/a',
      source: 'EX',
    });
    expect(items[1].title).toBe('Headline 2');
  });

  it('parses Atom entries via the href attribute', () => {
    const items = parseFeed(ATOM_SAMPLE, 'ATM');
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      title: 'Atom Headline 1',
      link: 'https://example.com/x',
      source: 'ATM',
    });
  });

  it("prefers Atom rel='alternate' when multiple <link> elements exist", () => {
    const items = parseFeed(ATOM_SAMPLE, 'ATM');
    expect(items[1].link).toBe('https://example.com/y');
  });

  it('handles a single RSS item (not wrapped in array)', () => {
    const xml = `<rss><channel><item><title>Only One</title><link>https://x.com/1</link></item></channel></rss>`;
    expect(parseFeed(xml, 'X')).toEqual([
      { title: 'Only One', link: 'https://x.com/1', source: 'X' },
    ]);
  });

  it('decodes common HTML entities in titles', () => {
    const xml = `<rss><channel><item><title>A &amp; B &lt;tag&gt; &quot;x&quot;</title><link>https://x.com</link></item></channel></rss>`;
    const [item] = parseFeed(xml, 'X');
    expect(item.title).toBe('A & B <tag> "x"');
  });

  it('returns [] on malformed XML', () => {
    expect(parseFeed('<not actually xml', 'X')).toEqual([]);
  });

  it('returns [] when the doc has neither rss nor atom feed', () => {
    expect(parseFeed('<other-root><stuff/></other-root>', 'X')).toEqual([]);
  });

  it('filters out items missing a title or link', () => {
    const xml = `<rss><channel>
      <item><title>ok</title><link>https://x.com/ok</link></item>
      <item><title></title><link>https://x.com/notitle</link></item>
      <item><title>nolink</title></item>
    </channel></rss>`;
    const items = parseFeed(xml, 'X');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('ok');
  });
});
