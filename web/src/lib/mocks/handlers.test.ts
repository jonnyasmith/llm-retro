import { describe, expect, it } from 'vitest';

import { healthUnavailable } from '$lib/features/control-plane';

import { server } from './node';

describe('the mock network', () => {
	it('answers the control-plane health check with a connected database', async () => {
		const response = await fetch('http://localhost/api/health');

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: 'ok', database: 'connected' });
	});

	it('honours a per-case override for the disconnected state', async () => {
		server.use(healthUnavailable);

		const response = await fetch('http://localhost/api/health');

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ status: 'error', database: 'disconnected' });
	});
});
