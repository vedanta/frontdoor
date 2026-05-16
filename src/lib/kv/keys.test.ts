import { describe, expect, it } from 'vitest';
import {
  apiKeyKey,
  emailKey,
  slugKey,
  userKey,
  USERS_SET,
  configKey,
  sourceKey,
  headlinesKey,
  weatherKey,
  formatDate,
} from './keys';

describe('KV key helpers', () => {
  it('apiKeyKey', () => {
    expect(apiKeyKey('abc123')).toBe('key:abc123');
  });

  it('emailKey lowercases the address', () => {
    expect(emailKey('Foo@Example.com')).toBe('email:foo@example.com');
  });

  it('slugKey', () => {
    expect(slugKey('a1b2c')).toBe('slug:a1b2c');
  });

  it('userKey', () => {
    expect(userKey('u_42')).toBe('user:u_42');
  });

  it('USERS_SET', () => {
    expect(USERS_SET).toBe('users');
  });

  it('configKey', () => {
    expect(configKey('u_42')).toBe('config:u_42');
  });

  describe('sourceKey', () => {
    it('formats date-stamped global sources', () => {
      expect(sourceKey('nasa-apod', '2026-05-15')).toBe('nasa-apod:2026-05-15');
    });

    it('defaults to today (UTC)', () => {
      const today = new Date().toISOString().slice(0, 10);
      expect(sourceKey('quote')).toBe(`quote:${today}`);
    });
  });

  describe('headlinesKey', () => {
    it('includes the feed-set hash', () => {
      expect(headlinesKey('a1b2c3', '2026-05-15')).toBe('headlines:a1b2c3:2026-05-15');
    });
  });

  describe('weatherKey', () => {
    it('shapes lat,lon and date', () => {
      expect(weatherKey(40.71, -74.01, '2026-05-15')).toBe('weather:40.71,-74.01:2026-05-15');
    });

    it('rounds lat/lon to 2 decimals so trivial drift hits the same cache', () => {
      expect(weatherKey(40.7099999, -74.01, '2026-05-15')).toBe('weather:40.71,-74.01:2026-05-15');
      expect(weatherKey(40.712, -74.013, '2026-05-15')).toBe('weather:40.71,-74.01:2026-05-15');
    });
  });

  describe('formatDate', () => {
    it('returns YYYY-MM-DD in UTC', () => {
      expect(formatDate(new Date('2026-05-15T23:59:00Z'))).toBe('2026-05-15');
    });

    it('does not drift by local timezone', () => {
      // Same UTC calendar day expressed at two different UTC times → same date string.
      expect(formatDate(new Date('2026-05-15T01:00:00Z'))).toBe(
        formatDate(new Date('2026-05-15T23:30:00Z')),
      );
    });
  });
});
