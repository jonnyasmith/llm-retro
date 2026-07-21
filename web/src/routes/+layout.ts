import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';

const mockApi = env.PUBLIC_MOCK_API === 'true';

// Client-render so the worker can intercept the loaders' requests.
export const ssr = !mockApi;

export const load = async () => {
	if (import.meta.env.DEV && mockApi && browser) {
		const { worker } = await import('$lib/mocks/browser');
		await worker.start({ onUnhandledRequest: 'bypass' });
	}

	return {};
};
