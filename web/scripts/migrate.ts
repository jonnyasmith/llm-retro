import { Pool } from 'pg';

import { getMigrationsDirectory, runMigrations } from '../src/lib/server/migrations.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 });

try {
	await runMigrations({
		pool,
		migrationsDirectory: getMigrationsDirectory()
	});
} finally {
	await pool.end();
}
