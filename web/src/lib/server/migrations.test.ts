import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runMigrations } from './migrations.js';

const postgresImage =
	'pgvector/pgvector:pg18-trixie@sha256:9d2e61c7352b9e9f4798df5fd9a498f043f4cda1cdacc707de3d198650f4321e';
const bootstrapMigrations = fileURLToPath(new URL('../../../../db/migrations', import.meta.url));

describe('migration runner', () => {
	let containerId: string;
	let pool: Pool;

	beforeAll(async () => {
		containerId = execFileSync(
			'docker',
			[
				'run',
				'--rm',
				'--detach',
				'--publish',
				'127.0.0.1::5432',
				'--env',
				'POSTGRES_USER=llm_retro',
				'--env',
				'POSTGRES_PASSWORD=test',
				'--env',
				'POSTGRES_DB=llm_retro',
				postgresImage
			],
			{ encoding: 'utf8' }
		).trim();

		const port = execFileSync(
			'docker',
			[
				'inspect',
				'--format',
				'{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',
				containerId
			],
			{ encoding: 'utf8' }
		).trim();
		pool = new Pool({
			connectionString: `postgresql://llm_retro:test@127.0.0.1:${port}/llm_retro`
		});

		for (let attempt = 0; attempt < 50; attempt += 1) {
			try {
				await pool.query('SELECT 1');
				return;
			} catch {
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		}

		throw new Error('ephemeral PostgreSQL did not become ready');
	}, 15_000);

	afterAll(async () => {
		await pool?.end();
		if (containerId) execFileSync('docker', ['stop', containerId]);
	});

	it('applies migrations once in lexical order', async () => {
		await runMigrations({ pool, migrationsDirectory: bootstrapMigrations });
		await runMigrations({ pool, migrationsDirectory: bootstrapMigrations });

		const bootstrapLedger = await pool.query<{ name: string }>(
			'SELECT name FROM schema_migrations ORDER BY name'
		);
		expect(bootstrapLedger.rows).toEqual([{ name: '0001_init.sql' }]);

		const laterMigrations = await mkdtemp(join(tmpdir(), 'llm-retro-migrations-'));
		try {
			await writeFile(
				join(laterMigrations, '0002-create-order-probe.sql'),
				'CREATE TABLE migration_order_probe (value integer NOT NULL); INSERT INTO migration_order_probe VALUES (41);'
			);
			await writeFile(
				join(laterMigrations, '0002_observe-order-probe.sql'),
				'INSERT INTO migration_order_probe SELECT value + 1 FROM migration_order_probe;'
			);

			await runMigrations({ pool, migrationsDirectory: laterMigrations });

			const orderedEffects = await pool.query<{ value: number }>(
				'SELECT value FROM migration_order_probe ORDER BY value'
			);
			expect(orderedEffects.rows).toEqual([{ value: 41 }, { value: 42 }]);
		} finally {
			await rm(laterMigrations, { recursive: true });
		}
	});
});
