import { bootstrap } from '$lib/server/bootstrap';
import { getActivityHeatmap, getSettings } from '$lib/server/database/store';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
  activity: getActivityHeatmap(bootstrap.database),
  timezone: getSettings(bootstrap.database).timezone,
});
