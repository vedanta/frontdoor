import { describe, expect, it } from 'vitest';
import { API_KEY_PREFIX, buildKeyUrl, mintIds } from './mint';

describe('mintIds', () => {
  it('apiKey is `fd_` + 32 hex chars, total 35 chars (#72)', () => {
    const { apiKey } = mintIds();
    expect(apiKey).toMatch(/^fd_[0-9a-f]{32}$/);
    expect(apiKey.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(apiKey).toHaveLength(35); // 3 (prefix) + 32 (hex)
  });

  it('userId is a UUID', () => {
    const { userId } = mintIds();
    expect(userId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('slug is 8 hex chars', () => {
    const { slug } = mintIds();
    expect(slug).toMatch(/^[0-9a-f]{8}$/);
  });

  it('successive calls produce distinct ids', () => {
    const a = mintIds();
    const b = mintIds();
    expect(a.apiKey).not.toBe(b.apiKey);
    expect(a.userId).not.toBe(b.userId);
    expect(a.slug).not.toBe(b.slug);
  });

  it('produces no collisions across many mints (smoke)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(mintIds().apiKey);
    expect(seen.size).toBe(1000);
  });
});

describe('buildKeyUrl', () => {
  it('formats `${origin}/?key=${key}`', () => {
    expect(buildKeyUrl('abc', 'https://frontdoor.app')).toBe('https://frontdoor.app/?key=abc');
  });
});
