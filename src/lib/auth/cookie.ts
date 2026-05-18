/**
 * Signed cookie payload — HMAC-SHA256 via Web Crypto so it works in both
 * the Node and Edge runtimes (the proxy runs on Edge).
 *
 * Format: `<base64url(json)>.<base64url(hmac)>`
 *   - payload is JSON-encoded
 *   - signature is over the payload bytes only (so swapping payload invalidates)
 *
 * Per docs/architecture.md §3.2 + §4: the cookie carries `userId`+`slug` so
 * the proxy can authenticate every request without a KV round-trip.
 */

function b64uEncode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uDecode(s: string): Uint8Array {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(norm);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (!secret) {
    throw new Error('cookie: COOKIE_SECRET is not set');
  }
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signCookie<T>(payload: T, secret: string): Promise<string> {
  const json = JSON.stringify(payload);
  const dataBytes = new TextEncoder().encode(json);
  const key = await hmacKey(secret);
  // Cast to BufferSource — TS 5.9 distinguishes Uint8Array<ArrayBuffer> from
  // Uint8Array<SharedArrayBuffer>; ours are always the former in practice.
  const sig = await crypto.subtle.sign('HMAC', key, dataBytes as BufferSource);
  return `${b64uEncode(dataBytes)}.${b64uEncode(new Uint8Array(sig))}`;
}

export async function verifyCookie<T>(cookie: string, secret: string): Promise<T | null> {
  try {
    const [dataB64, sigB64] = cookie.split('.');
    if (!dataB64 || !sigB64) return null;
    const dataBytes = b64uDecode(dataB64);
    const sigBytes = b64uDecode(sigB64);
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes as BufferSource,
      dataBytes as BufferSource,
    );
    if (!ok) return null;
    return JSON.parse(new TextDecoder().decode(dataBytes)) as T;
  } catch {
    return null;
  }
}
