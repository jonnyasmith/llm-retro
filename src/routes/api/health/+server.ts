import { bootstrap } from '$lib/server/bootstrap';
import { json } from '@sveltejs/kit';

export function GET(): Response {
  bootstrap.sqlite.prepare('select 1').get();

  return json({
    status: 'ok',
    database: 'connected',
  });
}
