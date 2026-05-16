import { describe, expect, it } from 'vitest';
import { clientIp } from './index';

describe('clientIp', () => {
  it('returns first IP from x-forwarded-for', () => {
    const h = new Headers({ 'x-forwarded-for': '203.0.113.1, 10.0.0.1' });
    expect(clientIp(h)).toBe('203.0.113.1');
  });

  it('falls back to x-real-ip', () => {
    const h = new Headers({ 'x-real-ip': '203.0.113.2' });
    expect(clientIp(h)).toBe('203.0.113.2');
  });

  it('falls back to "local" when no forwarding headers are present', () => {
    const h = new Headers();
    expect(clientIp(h)).toBe('local');
  });

  it('trims whitespace around the first XFF entry', () => {
    const h = new Headers({ 'x-forwarded-for': '  203.0.113.3  , 10.0.0.1' });
    expect(clientIp(h)).toBe('203.0.113.3');
  });
});

// We don't unit-test the limiters themselves — they wrap @upstash/ratelimit
// which talks to live Redis. Route tests stub the limiters to always succeed
// (the upstream library is its own concern).
