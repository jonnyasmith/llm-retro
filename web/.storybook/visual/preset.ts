// Local Storybook addon that wires the "Visual tests" panel: the manager entry
// renders the React panel, and viteFinal mounts the dev-server bridge that
// serves the manifest/screenshots and triggers runs. See docs/adr/0007-*.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));

export const managerEntries = (entries: string[] = []) => [
	...entries,
	path.join(here, 'manager.tsx')
];

export const viteFinal = async (config: { plugins?: Plugin[] }) => {
	const { visualMiddleware } = await import('./middleware.ts');
	config.plugins = config.plugins ?? [];
	config.plugins.push(visualMiddleware());
	return config;
};
