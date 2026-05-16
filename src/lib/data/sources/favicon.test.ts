import { describe, expect, it } from 'vitest';
import { faviconUrl, letterTile } from './favicon';

describe('faviconUrl', () => {
  it('builds an icon.horse URL from the hostname', () => {
    expect(faviconUrl('https://nytimes.com')).toBe('https://icon.horse/icon/nytimes.com');
    expect(faviconUrl('https://www.bbc.co.uk/news')).toBe('https://icon.horse/icon/www.bbc.co.uk');
  });

  it('uses the override URL when provided', () => {
    expect(faviconUrl('https://example.com', 'https://custom.com/icon.png')).toBe(
      'https://custom.com/icon.png',
    );
  });

  it('returns "" on malformed URL (caller falls through to letter tile)', () => {
    expect(faviconUrl('not-a-url')).toBe('');
  });
});

describe('letterTile', () => {
  it('returns the uppercased first character', () => {
    expect(letterTile('ChatGPT')).toBe('C');
    expect(letterTile('claude.ai')).toBe('C');
  });

  it('trims whitespace before picking', () => {
    expect(letterTile('  perplexity')).toBe('P');
  });

  it('falls back to ? on empty', () => {
    expect(letterTile('')).toBe('?');
    expect(letterTile('   ')).toBe('?');
  });
});
