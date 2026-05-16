import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, afterAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './src/mocks/server';

// Auto-cleanup React DOM between tests.
afterEach(() => {
  cleanup();
});

// MSW lifecycle for unit/integration tests.
// `onUnhandledRequest: 'error'` makes accidental real network calls fail loudly —
// per docs/architecture.md §6 we never want a test hitting the real upstream.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
