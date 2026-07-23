import { bootstrap } from '$lib/server/bootstrap';
import {
  getHarnessBreakdown,
  getModelBreakdown,
} from '$lib/server/database/store';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
  harnesses: getHarnessBreakdown(bootstrap.database),
  models: getModelBreakdown(bootstrap.database),
});
