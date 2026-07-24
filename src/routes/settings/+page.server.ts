import { bootstrap } from '$lib/server/bootstrap';
import { getSettings } from '$lib/server/database/store';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
  const settings = getSettings(bootstrap.database);
  const timezones = Intl.supportedValuesOf('timeZone');
  if (!timezones.includes(settings.timezone)) {
    timezones.push(settings.timezone);
    timezones.sort();
  }

  return { settings, timezones };
};
