import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/**
 * Node-side MSW server, installed by vitest.setup.ts for every test run.
 * If the data layer ever needs a browser-side worker (it shouldn't — fetches
 * happen server-side), add src/mocks/browser.ts using setupWorker.
 */
export const server = setupServer(...handlers);
