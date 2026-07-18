import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { Pool } from 'pg';

type MigrationOptions = {
	pool: Pool;
	migrationsDirectory: string;
};

export function getMigrationsDirectory(): string {
	return process.env.MIGRATIONS_DIRECTORY ?? resolve(process.cwd(), '../db/migrations');
}

export async function runMigrations({
	pool,
	migrationsDirectory
}: MigrationOptions): Promise<void> {
	const migrations = (await readdir(migrationsDirectory, { withFileTypes: true }))
		.filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
		.map((entry) => entry.name)
		.sort();

	for (const migration of migrations) {
		const sql = await readFile(resolve(migrationsDirectory, migration), 'utf8');
		const client = await pool.connect();

		try {
			await client.query('BEGIN');
			const ledger = await client.query<{ exists: boolean }>(
				"SELECT to_regclass('schema_migrations') IS NOT NULL AS exists"
			);
			const applied = ledger.rows[0].exists
				? await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [migration])
				: undefined;
			if (applied?.rowCount !== 1) {
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
