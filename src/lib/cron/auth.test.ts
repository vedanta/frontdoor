import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkCronAuth } from './auth';

const ORIG_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = 'test-cron-secret';
});

afterEach(() => {
  process.env.CRON_SECRET = ORIG_SECRET;
});

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://x/', { headers });
}

describe('checkCronAuth', () => {
  it('returns ok on a matching bearer token', () => {
    expect(checkCronAuth(req({ authorization: 'Bearer test-cron-secret' }))).toEqual({ ok: true });
  });

  it('accepts lowercase "bearer"', () => {
    expect(checkCronAuth(req({ authorization: 'bearer test-cron-secret' }))).toEqual({ ok: true });
  });

  it('401 when header is missing', () => {
    expect(checkCronAuth(req())).toEqual({ ok: false, status: 401 });
  });

  it('401 when token mismatches', () => {
    expect(checkCronAuth(req({ authorization: 'Bearer wrong' }))).toEqual({
      ok: false,
      status: 401,
    });
  });

  it('401 when header is not Bearer-shaped', () => {
    expect(checkCronAuth(req({ authorization: 'Basic abc' }))).toEqual({
      ok: false,
      status: 401,
    });
  });

  it('500 when CRON_SECRET env is missing (misconfig)', () => {
    delete process.env.CRON_SECRET;
    expect(checkCronAuth(req({ authorization: 'Bearer anything' }))).toEqual({
      ok: false,
      status: 500,
    });
  });
});
