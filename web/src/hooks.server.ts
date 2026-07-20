import type { ServerInit } from '@sveltejs/kit';

import { getDatabasePool } from '$lib/server/database';
import { getMigrationsDirectory, runMigrations } from '$lib/server/migrations';

export const init: ServerInit = async () => {
	await runMigrations({
		pool: getDatabasePool(),
		migrationsDirectory: getMigrationsDirectory()
	});
};
