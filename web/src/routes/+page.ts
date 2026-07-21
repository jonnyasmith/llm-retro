import type { PageLoad } from './$types';

type Health = { status: string; database: string };

/**
 * Route orchestration owns data loading (ADR-0004). In the mock-mode
 * application this `/api/health` request is answered by MSW; in production it
 * hits the real endpoint.
 */
export const load: PageLoad = async ({ fetch }) => {
	const response = await fetch('/api/health');
	const health = (await response.json()) as Health;

	return { health };
};
