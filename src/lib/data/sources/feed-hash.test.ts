import { describe, expect, it } from 'vitest';
import { feedSetHash } from './feed-hash';

const feeds = [
  { url: 'https://a.example.com/rss', name: 'A' },
  { url: 'https://b.example.com/rss', name: 'B' },
];

describe('feedSetHash', () => {
  it('is deterministic for the same input', async () => {
    const h1 = await feedSetHash(feeds, 7);
    const h2 = await feedSetHash(feeds, 7);
    expect(h1).toBe(h2);
  });

  it('is order-independent (urls are sorted before hashing)', async () => {
    const reversed = [...feeds].reverse();
    expect(await feedSetHash(feeds, 7)).toBe(await feedSetHash(reversed, 7));
  });

  it('changes when the count changes', async () => {
    expect(await feedSetHash(feeds, 7)).not.toBe(await feedSetHash(feeds, 8));
  });

  it('changes when a feed url changes', async () => {
    const other = [feeds[0], { url: 'https://c.example.com/rss', name: 'C' }];
    expect(await feedSetHash(feeds, 7)).not.toBe(await feedSetHash(other, 7));
  });

  it('ignores feed names (only urls + count contribute)', async () => {
    const renamed = feeds.map((f) => ({ ...f, name: `${f.name}-renamed` }));
    expect(await feedSetHash(feeds, 7)).toBe(await feedSetHash(renamed, 7));
  });

  it('returns an 8-char hex string', async () => {
    const h = await feedSetHash(feeds, 7);
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });
});
