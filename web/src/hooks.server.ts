import type { ServerInit } from '@sveltejs/kit';
import { resolve } from 'node:path';

import { getDatabasePool } from '$lib/server/database';
import { runMigrations } from '$lib/server/migrations';

export const init: ServerInit = async () => {
	await runMigrations({
		pool: getDatabasePool(),
		migrationsDirectory: process.env.MIGRATIONS_DIRECTORY ?? resolve(process.cwd(), '../db/migrations')
	});
};
