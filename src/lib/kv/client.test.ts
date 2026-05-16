import { afterEach, describe, expect, it } from 'vitest';
import { getRedis, resetRedis } from './client';

const ORIG_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIG_ENV };
  resetRedis();
});

describe('KV client', () => {
  it('throws a helpful error if env vars are missing', () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    expect(() => getRedis()).toThrowError(/KV_REST_API_URL/);
  });

  it('returns a Redis instance when env vars are present', () => {
    process.env.KV_REST_API_URL = 'https://fake-kv.upstash.io';
    process.env.KV_REST_API_TOKEN = 'test-token';

    const redis = getRedis();
    expect(redis).toBeDefined();
    expect(typeof redis.get).toBe('function');
    expect(typeof redis.set).toBe('function');
    expect(typeof redis.sadd).toBe('function');
  });

  it('caches the singleton — repeated getRedis() returns the same instance', () => {
    process.env.KV_REST_API_URL = 'https://fake-kv.upstash.io';
    process.env.KV_REST_API_TOKEN = 'test-token';

    expect(getRedis()).toBe(getRedis());
  });

  it('resetRedis() forces a rebuild', () => {
    process.env.KV_REST_API_URL = 'https://fake-kv.upstash.io';
    process.env.KV_REST_API_TOKEN = 'test-token';

    const first = getRedis();
    resetRedis();
    const second = getRedis();
    expect(first).not.toBe(second);
  });
});
