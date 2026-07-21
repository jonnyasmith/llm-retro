import { setupServer } from 'msw/node';

import { handlers } from './handlers';

/** Node server letting Vitest reuse the same handler set as the browser. */
export const server = setupServer(...handlers);
