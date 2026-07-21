import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';

const mockApi = env.PUBLIC_MOCK_API === 'true';

/**
 * Mock mode (`pnpm dev:mock`) runs the real application against the MSW mock
 * network with no database. It renders client-side so the browser worker can
 * intercept the loaders' `/api/*` requests; the worker never ships to
 * production because the import is guarded by `import.meta.env.DEV`.
 */
export const ssr = !mockApi;

export const load = async () => {
	if (import.meta.env.DEV && mockApi && browser) {
		const { worker } = await import('$lib/mocks/browser');
		await worker.start({ onUnhandledRequest: 'bypass' });
	}

	return {};
};
