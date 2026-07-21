import type { PageLoad } from './$types';

type Health = { status: string; database: string };

export const load: PageLoad = async ({ fetch }) => {
	const response = await fetch('/api/health');
	const health = (await response.json()) as Health;

	return { health };
};
