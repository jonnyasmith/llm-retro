import { bootstrap } from '$lib/server/bootstrap';
import { json } from '@sveltejs/kit';

export function GET(): Response {
  bootstrap.assertConnected();

  return json({
    status: 'ok',
    database: 'connected',
  });
}
