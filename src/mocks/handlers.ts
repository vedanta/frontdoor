import { http, HttpResponse } from 'msw';

/**
 * MSW handlers — mock the upstream services the data layer touches.
 *
 * Each fetcher's tests (#6 RSS, #7 image sources, #8 text sources, #9 weather)
 * will add its own handler(s) here. The seed handler below proves the wiring;
 * delete it once a real handler lands.
 */
export const handlers = [
  // Sanity handler — used by src/mocks/example.test.ts
  http.get('https://example.invalid/ping', () => {
    return HttpResponse.json({ ok: true });
  }),
];
