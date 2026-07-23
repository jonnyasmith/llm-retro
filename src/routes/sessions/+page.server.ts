import { bootstrap } from '$lib/server/bootstrap';
import { getSessionShape } from '$lib/server/database/store';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
  sessions: getSessionShape(bootstrap.database),
});
