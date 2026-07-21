import { setupWorker } from 'msw/browser';

import { handlers } from './handlers';

/** Browser worker backing Storybook and the mock-mode application. */
export const worker = setupWorker(...handlers);
