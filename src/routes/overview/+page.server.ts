import { bootstrap } from '$lib/server/bootstrap';
import { getOverviewTotals } from '$lib/server/database/store';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
  totals: getOverviewTotals(bootstrap.database),
});
