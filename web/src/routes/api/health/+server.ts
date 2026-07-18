import { getDatabasePool } from '$lib/server/database';
import { json } from '@sveltejs/kit';

export async function GET() {
	try {
		await getDatabasePool().query('SELECT 1');

		return json({ status: 'ok', database: 'connected' });
	} catch {
		return json({ status: 'error', database: 'disconnected' }, { status: 503 });
	}
}
