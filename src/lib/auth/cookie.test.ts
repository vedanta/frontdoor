import { describe, expect, it } from 'vitest';
import { signCookie, verifyCookie } from './cookie';

const SECRET = 'test-secret-do-not-use-in-prod-but-long-enough-yes';

describe('signCookie / verifyCookie', () => {
  it('round-trips a payload', async () => {
    const payload = { userId: 'u_1', slug: 'a1b2c3d4' };
    const signed = await signCookie(payload, SECRET);
    expect(signed).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/); // base64url.base64url
    const back = await verifyCookie<typeof payload>(signed, SECRET);
    expect(back).toEqual(payload);
  });

  it('rejects a payload signed with a different secret', async () => {
    const signed = await signCookie({ userId: 'u_1', slug: 's' }, SECRET);
    expect(await verifyCookie(signed, 'different-secret-must-fail-verification')).toBeNull();
  });

  it('rejects a payload swapped under the original signature', async () => {
    // Sign two different payloads; splice the data of one onto the sig of the other.
    // Unambiguous: the data bytes differ, so the HMAC over the original cannot validate.
    const a = await signCookie({ userId: 'u_1', slug: 'aaa' }, SECRET);
    const b = await signCookie({ userId: 'u_2', slug: 'bbb' }, SECRET);
    const dataA = a.split('.')[0];
    const sigB = b.split('.')[1];
    expect(await verifyCookie(`${dataA}.${sigB}`, SECRET)).toBeNull();
  });

  it('rejects a tampered signature', async () => {
    const signed = await signCookie({ userId: 'u_1', slug: 'aaa' }, SECRET);
    const [data, sig] = signed.split('.');
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    expect(await verifyCookie(`${data}.${flipped}`, SECRET)).toBeNull();
  });

  it('rejects malformed input', async () => {
    expect(await verifyCookie('not-a-cookie', SECRET)).toBeNull();
    expect(await verifyCookie('', SECRET)).toBeNull();
    expect(await verifyCookie('only-one-part', SECRET)).toBeNull();
  });

  it('throws if the secret is missing', async () => {
    await expect(signCookie({ x: 1 }, '')).rejects.toThrow(/COOKIE_SECRET/);
  });
});
