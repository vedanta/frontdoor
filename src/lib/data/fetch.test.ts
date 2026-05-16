import { afterEach, describe, expect, it } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { fetchUpstream } from './fetch';

const BASE = 'https://upstream.invalid';

afterEach(() => {
  server.resetHandlers();
});

describe('fetchUpstream', () => {
  it('returns parsed JSON on 200', async () => {
    server.use(http.get(`${BASE}/ok`, () => HttpResponse.json({ hello: 'world' })));
    const result = await fetchUpstream<{ hello: string }>(`${BASE}/ok`);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.hello).toBe('world');
      expect(result.status).toBe(200);
    }
  });

  it('sends User-Agent: frontdoor/1.0 by default', async () => {
    let seenUA: string | null = null;
    server.use(
      http.get(`${BASE}/ua`, ({ request }) => {
        seenUA = request.headers.get('user-agent');
        return HttpResponse.json({});
      }),
    );
    await fetchUpstream(`${BASE}/ua`);
    expect(seenUA).toBe('frontdoor/1.0');
  });

  it('allows User-Agent override via headers option', async () => {
    let seenUA: string | null = null;
    server.use(
      http.get(`${BASE}/ua`, ({ request }) => {
        seenUA = request.headers.get('user-agent');
        return HttpResponse.json({});
      }),
    );
    await fetchUpstream(`${BASE}/ua`, { headers: { 'User-Agent': 'custom/2' } });
    expect(seenUA).toBe('custom/2');
  });

  it('returns ok:false with status on HTTP 404', async () => {
    server.use(http.get(`${BASE}/missing`, () => new HttpResponse(null, { status: 404 })));
    const result = await fetchUpstream(`${BASE}/missing`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.reason).toMatch(/http 404/);
    }
  });

  it('returns ok:false with status on HTTP 503', async () => {
    server.use(http.get(`${BASE}/down`, () => new HttpResponse(null, { status: 503 })));
    const result = await fetchUpstream(`${BASE}/down`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(503);
    }
  });

  it('returns ok:false with reason="timeout" when the request hangs past timeoutMs', async () => {
    server.use(
      http.get(`${BASE}/slow`, async () => {
        await delay(500);
        return HttpResponse.json({});
      }),
    );
    const result = await fetchUpstream(`${BASE}/slow`, { timeoutMs: 50 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('timeout');
    }
  });

  it('parses text bodies when parseAs="text"', async () => {
    server.use(http.get(`${BASE}/xml`, () => HttpResponse.xml('<rss>...</rss>')));
    const result = await fetchUpstream<string>(`${BASE}/xml`, { parseAs: 'text' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toContain('<rss>');
  });
});
