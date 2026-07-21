import { http, HttpResponse } from 'msw';

export const controlPlaneHandlers = [
	http.get('*/api/health', () => HttpResponse.json({ status: 'ok', database: 'connected' }))
];

export const healthUnavailable = http.get('*/api/health', () =>
	HttpResponse.json({ status: 'error', database: 'disconnected' }, { status: 503 })
);
