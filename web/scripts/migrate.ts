import { resolve } from 'node:path';

import { Pool } from 'pg';

import { runMigrations } from '../src/lib/server/migrations.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 });

try {
	await runMigrations({
		pool,
		migrationsDirectory: process.env.MIGRATIONS_DIRECTORY ?? resolve(process.cwd(), '../db/migrations')
	});
} finally {
	await pool.end();
}
