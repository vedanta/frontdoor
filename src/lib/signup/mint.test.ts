import { describe, expect, it } from 'vitest';
import {
  API_KEY_PREFIX,
  BOOTSTRAP_TOKEN_PREFIX,
  BOOTSTRAP_TOKEN_TTL_SEC,
  buildBootstrapUrl,
  buildKeyUrl,
  mintBootstrapToken,
  mintIds,
} from './mint';

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

  it('bootstrapToken is `fdb_` + 32 hex chars (#73)', () => {
    const { bootstrapToken } = mintIds();
    expect(bootstrapToken).toMatch(/^fdb_[0-9a-f]{32}$/);
    expect(bootstrapToken.startsWith(BOOTSTRAP_TOKEN_PREFIX)).toBe(true);
    expect(bootstrapToken).toHaveLength(36); // 4 (prefix) + 32 (hex)
  });

  it('successive calls produce distinct ids (including bootstrap)', () => {
    const a = mintIds();
    const b = mintIds();
    expect(a.apiKey).not.toBe(b.apiKey);
    expect(a.userId).not.toBe(b.userId);
    expect(a.slug).not.toBe(b.slug);
    expect(a.bootstrapToken).not.toBe(b.bootstrapToken);
  });

  it('produces no collisions across many mints (smoke)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(mintIds().apiKey);
    expect(seen.size).toBe(1000);
  });
});

describe('mintBootstrapToken', () => {
  it('emits a fresh `fdb_`-prefixed token each call', () => {
    const a = mintBootstrapToken();
    const b = mintBootstrapToken();
    expect(a).toMatch(/^fdb_[0-9a-f]{32}$/);
    expect(b).toMatch(/^fdb_[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });
});

describe('BOOTSTRAP_TOKEN_TTL_SEC', () => {
  it('is 5 minutes (300 seconds)', () => {
    expect(BOOTSTRAP_TOKEN_TTL_SEC).toBe(300);
  });
});

describe('buildBootstrapUrl', () => {
  it('formats `${origin}/?bootstrap=${token}`', () => {
    expect(buildBootstrapUrl('fdb_abc', 'https://frontdoor.app')).toBe(
      'https://frontdoor.app/?bootstrap=fdb_abc',
    );
  });
});

describe('buildKeyUrl (legacy, kept for 60-day backwards-compat)', () => {
  it('formats `${origin}/?key=${key}`', () => {
    expect(buildKeyUrl('abc', 'https://frontdoor.app')).toBe('https://frontdoor.app/?key=abc');
  });
});
