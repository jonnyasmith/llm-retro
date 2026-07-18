import { env } from '$env/dynamic/private';
import { Pool } from 'pg';

let pool: Pool | undefined;

export function getDatabasePool(): Pool {
	if (!env.DATABASE_URL) {
		throw new Error('DATABASE_URL is required');
	}

	pool ??= new Pool({
		connectionString: env.DATABASE_URL,
		connectionTimeoutMillis: 5_000
	});

	return pool;
}
