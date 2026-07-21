import { http, HttpResponse } from 'msw';

/**
 * Control-plane mock network.
 *
 * `controlPlaneHandlers` is the happy path used everywhere by default. Exercise
 * a failure state by passing a named override (e.g. `healthUnavailable`) to
 * `server.use(...)` in a test or to a story's `msw` parameters, then resetting.
 */
export const controlPlaneHandlers = [
	http.get('*/api/health', () => HttpResponse.json({ status: 'ok', database: 'connected' }))
];

/** Runtime override: the control plane cannot reach the database. */
export const healthUnavailable = http.get('*/api/health', () =>
	HttpResponse.json({ status: 'error', database: 'disconnected' }, { status: 503 })
);
