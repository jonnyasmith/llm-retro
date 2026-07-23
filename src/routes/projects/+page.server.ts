import { bootstrap } from '$lib/server/bootstrap';
import { getProjectBreakdown } from '$lib/server/database/store';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
  projects: getProjectBreakdown(bootstrap.database),
});
