import type { ServerInit } from '@sveltejs/kit';

import { env } from '$env/dynamic/public';
import { getDatabasePool } from '$lib/server/database';
import { getMigrationsDirectory, runMigrations } from '$lib/server/migrations';

export const init: ServerInit = async () => {
	// Mock mode runs without a database.
	if (env.PUBLIC_MOCK_API === 'true') return;

	await runMigrations({
		pool: getDatabasePool(),
		migrationsDirectory: getMigrationsDirectory()
	});
};
