import { dev } from '$app/environment';
import type { Handle, ServerInit } from '@sveltejs/kit';

import { getDatabasePool } from '$lib/server/database';
import { getMigrationsDirectory, runMigrations } from '$lib/server/migrations';

export const init: ServerInit = async () => {
	await runMigrations({
		pool: getDatabasePool(),
		migrationsDirectory: getMigrationsDirectory()
	});
};

// Prototypes are a dev-only staging area. Hard-404 the whole /prototype subtree
// in any non-dev build — before rendering, so it covers both the document and
// its data requests (a per-route ssr=false guard would only gate the data).
export const handle: Handle = ({ event, resolve }) => {
	const { pathname } = event.url;
	if (!dev && (pathname === '/prototype' || pathname.startsWith('/prototype/'))) {
		return new Response('Not found', { status: 404 });
	}
	return resolve(event);
};
