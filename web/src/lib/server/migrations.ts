import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { Pool } from 'pg';

const createLedger = `
	CREATE TABLE IF NOT EXISTS schema_migrations (
		name text PRIMARY KEY,
		applied_at timestamptz NOT NULL DEFAULT now()
	)
`;

type MigrationOptions = {
	pool: Pool;
	migrationsDirectory: string;
};

export async function runMigrations({
	pool,
	migrationsDirectory
}: MigrationOptions): Promise<void> {
	const migrations = (await readdir(migrationsDirectory, { withFileTypes: true }))
		.filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
		.map((entry) => entry.name)
		.sort((left, right) => left.localeCompare(right));

	for (const migration of migrations) {
		const sql = await readFile(resolve(migrationsDirectory, migration), 'utf8');
		const client = await pool.connect();

		try {
			await client.query('BEGIN');
			await client.query(createLedger);

			const applied = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [
				migration
			]);
			if (applied.rowCount === 0) {
				await client.query(sql);
				await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration]);
			}

			await client.query('COMMIT');
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
	}
}
